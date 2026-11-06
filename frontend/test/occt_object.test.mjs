import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { faceColorGroups, occtResultToObject } from '../src/occt_object.js';

const RED = [1, 0, 0];
const BLUE = [0, 0, 1];

// A mesh of occt-import-js with the given number of triangles
function occtMesh(triangles, brepFaces, color = [0.5, 0.5, 0.5]) {
  return {
    color,
    brep_faces: brepFaces,
    attributes: { position: { array: new Array(triangles * 9).fill(0) } },
    index: { array: Array.from({ length: triangles * 3 }, (_, i) => i) }
  };
}

const material = (color) => new THREE.MeshStandardMaterial({ color });

test('faces without their own color need no groups', () => {
  assert.equal(faceColorGroups(undefined, 4), null);
  assert.equal(faceColorGroups([{ first: 0, last: 1, color: null }, { first: 2, last: 3, color: null }], 4), null);
});

test('adjacent faces of the same color are merged and gaps get the color of the body', () => {
  const groups = faceColorGroups([
    { first: 4, last: 5, color: null },
    { first: 0, last: 1, color: RED },
    { first: 2, last: 2, color: RED },
    { first: 6, last: 6, color: BLUE }
  ], 9);
  assert.deepEqual(groups, [[0, 9, RED], [9, 9, null], [18, 3, BLUE], [21, 6, null]]);
});

test('meshes without face colors keep one material of the body color', () => {
  const object = occtResultToObject({ meshes: [occtMesh(2, [{ first: 0, last: 1, color: null }], [0, 1, 0])] },
                                    material, 0x9aa5b1);
  const mesh = object.children[0];
  assert.ok(!Array.isArray(mesh.material));
  assert.equal(mesh.material.color.getHex(), new THREE.Color(0, 1, 0).getHex());
  assert.equal(mesh.geometry.groups.length, 0);
});

test('faces with their own color get material groups with one material per color', () => {
  const faces = [{ first: 0, last: 0, color: RED }, { first: 1, last: 1, color: null },
                 { first: 2, last: 2, color: RED }];
  const mesh = occtResultToObject({ meshes: [occtMesh(3, faces, null)] }, material, 0x9aa5b1).children[0];
  assert.equal(mesh.material.length, 2);
  assert.equal(mesh.material[0].color.getHex(), 0xff0000);
  assert.equal(mesh.material[1].color.getHex(), 0x9aa5b1);
  assert.deepEqual(mesh.geometry.groups.map((g) => [g.start, g.count, g.materialIndex]),
                   [[0, 3, 0], [3, 3, 1], [6, 3, 0]]);
});
