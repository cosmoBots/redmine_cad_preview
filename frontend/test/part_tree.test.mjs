import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { hasParts, hiddenParts, isShown, partNodes, setHiddenParts, showOnly, visibleBox } from '../src/part_tree.js';
import { occtResultToObject } from '../src/occt_object.js';

function box(name, x) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  mesh.name = name;
  mesh.position.x = x;
  return mesh;
}

function group(name, ...children) {
  const object = new THREE.Group();
  object.name = name;
  object.add(...children);
  return object;
}

// Unnamed root, assembly with two bolts of the same name and a plate
function model() {
  return group('', group('asm', group('bolts', box('bolt', 0), box('bolt', 2)), box('plate', 10)));
}

test('parts are identified by their names, with numbers for siblings of the same name', () => {
  const nodes = partNodes(model());
  assert.equal(nodes.length, 1);
  assert.equal(nodes[0].path, 'asm');
  assert.deepEqual(nodes[0].children.map((node) => node.path), ['asm/bolts', 'asm/plate']);
  assert.deepEqual(nodes[0].children[0].children.map((node) => node.path), ['asm/bolts/bolt#1', 'asm/bolts/bolt#2']);
});

test('only models with more than one part have parts', () => {
  assert.equal(hasParts(model()), true);
  assert.equal(hasParts(group('', group('part', box('part', 0)))), false);
});

test('hidden parts are listed without their children and restored by their paths', () => {
  const root = model();
  const [asm] = partNodes(root);
  asm.children[0].object.visible = false;
  assert.deepEqual(hiddenParts(root), ['asm/bolts']);

  const other = model();
  setHiddenParts(other, ['asm/bolts/bolt#2', 'asm/unknown']);
  assert.deepEqual(hiddenParts(other), ['asm/bolts/bolt#2']);
  setHiddenParts(other, []);
  assert.deepEqual(hiddenParts(other), []);
});

test('showing only a part hides the others and the box contains only the shown parts', () => {
  const root = model();
  const plate = partNodes(root)[0].children[1].object;
  showOnly(root, plate);
  assert.deepEqual(hiddenParts(root), ['asm/bolts']);
  assert.equal(isShown(plate, root), true);
  const size = visibleBox(root).getSize(new THREE.Vector3());
  assert.deepEqual(size.toArray(), [1, 1, 1]);
});

test('occt-import-js results keep the product tree with the names of the parts', () => {
  const mesh = (name) => ({
    name, attributes: { position: { array: new Array(9).fill(0) } }, index: { array: [0, 1, 2] }
  });
  const result = {
    meshes: [mesh('bolt'), mesh('bolt'), mesh('plate')],
    root: { name: '', meshes: [], children: [
      { name: 'asm', meshes: [], children: [
        { name: 'bolt', meshes: [0], children: [] }, { name: 'bolt', meshes: [1], children: [] },
        { name: 'plate', meshes: [2], children: [] }
      ] }
    ] }
  };
  const object = occtResultToObject(result, (color) => new THREE.MeshStandardMaterial({ color }), 0x9aa5b1);
  const [asm] = partNodes(object);
  assert.deepEqual(asm.children.map((node) => node.path), ['asm/bolt#1', 'asm/bolt#2', 'asm/plate']);
  assert.ok(asm.children.every((node) => node.children.length === 0));
});
