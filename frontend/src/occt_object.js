// Converts the result of occt-import-js (STEP, IGES, BREP) into three.js
// meshes. Faces of the B-rep with their own color get a material group of
// this color, the other faces the color of the body.

import * as THREE from 'three';

function colorOf(rgb) {
  return rgb ? new THREE.Color(rgb[0], rgb[1], rgb[2]) : null;
}

// Material groups of the faces as [start, count, color] in indices, merged
// for adjacent faces of the same color. Triangles of no face get the color of
// the body (null). Returns null if no face has its own color.
export function faceColorGroups(faces, triangleCount) {
  if (!faces?.some((face) => face.color)) return null;

  const groups = [];
  const add = (first, last, color) => {
    if (last < first) return;
    const key = color ? color.join(',') : null;
    const previous = groups[groups.length - 1];
    if (previous && previous.key === key && previous.last === first - 1) {
      previous.last = last;
    } else {
      groups.push({ first, last, color, key });
    }
  };

  let next = 0;
  for (const face of [...faces].sort((a, b) => a.first - b.first)) {
    if (face.first < next) continue;
    add(next, face.first - 1, null);
    add(face.first, Math.min(face.last, triangleCount - 1), face.color || null);
    next = face.last + 1;
  }
  add(next, triangleCount - 1, null);
  return groups.map(({ first, last, color }) => [first * 3, (last - first + 1) * 3, color]);
}

// materialFor(color) returns a new material of the color
export function occtResultToObject(result, materialFor, defaultColor) {
  const group = new THREE.Group();
  for (const mesh of result.meshes) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(mesh.attributes.position.array, 3));
    if (mesh.attributes.normal) {
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(mesh.attributes.normal.array, 3));
    }
    geometry.setIndex(new THREE.Uint32BufferAttribute(Uint32Array.from(mesh.index.array), 1));
    if (!mesh.attributes.normal) geometry.computeVertexNormals();

    const bodyColor = colorOf(mesh.color) || new THREE.Color(defaultColor);
    const groups = faceColorGroups(mesh.brep_faces, mesh.index.array.length / 3);
    if (!groups) {
      group.add(new THREE.Mesh(geometry, materialFor(bodyColor)));
      continue;
    }

    // One material per color, shared by the groups of this color
    const materials = [];
    const indexOf = new Map();
    for (const [start, count, rgb] of groups) {
      const key = rgb ? rgb.join(',') : 'body';
      if (!indexOf.has(key)) {
        indexOf.set(key, materials.length);
        materials.push(materialFor(colorOf(rgb) || bodyColor));
      }
      geometry.addGroup(start, count, indexOf.get(key));
    }
    group.add(new THREE.Mesh(geometry, materials));
  }
  return group;
}
