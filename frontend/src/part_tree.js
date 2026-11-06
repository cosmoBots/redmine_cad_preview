// Parts of a model: the tree of the named objects, the parts that are hidden
// and the box of the parts that are shown.
//
// A part is identified by the names of the objects from the model to the
// part, e.g. "as1/l-bracket-assembly#2/bolt". Siblings with the same name are
// numbered, so that a saved view stays valid when the file is uploaded again
// with the same structure.

import * as THREE from 'three';

function nameOf(object) {
  return object.name || 'part';
}

function segment(object) {
  const siblings = object.parent.children.filter((child) => nameOf(child) === nameOf(object));
  return siblings.length > 1 ? `${nameOf(object)}#${siblings.indexOf(object) + 1}` : nameOf(object);
}

export function partPath(object, root) {
  const segments = [];
  for (let current = object; current && current !== root; current = current.parent) {
    segments.unshift(segment(current));
  }
  return segments.join('/');
}

// A group with only one mesh and no other children is shown as one part
function leafMesh(object) {
  return !object.isMesh && object.children.length === 1 && object.children[0].isMesh &&
         object.children[0].children.length === 0;
}

// Tree of the parts below root: [{object, name, path, children}]. Unnamed
// groups with a single child are skipped.
export function partNodes(root) {
  const nodes = (parent) => parent.children.flatMap((child) => {
      if (!child.name && !child.isMesh && child.children.length === 1) return nodes(child);
      return [{
        object: child, name: nameOf(child), path: partPath(child, root),
        children: child.isMesh || leafMesh(child) ? [] : nodes(child)
      }];
    });
  return nodes(root);
}

function countParts(nodes) {
  return nodes.reduce((count, node) => count + (node.children.length ? countParts(node.children) : 1), 0);
}

// True if the model has more than one part to show or hide
export function hasParts(root) {
  return countParts(partNodes(root)) > 1;
}

// True if the object and all its ancestors below root are visible
export function isShown(object, root) {
  for (let current = object; current && current !== root; current = current.parent) {
    if (!current.visible) return false;
  }
  return true;
}

// Paths of the hidden parts. Parts below a hidden part are not listed.
export function hiddenParts(root) {
  const paths = [];
  const collect = (nodes) => nodes.forEach((node) => {
    if (!node.object.visible) paths.push(node.path);
    else collect(node.children);
  });
  collect(partNodes(root));
  return paths;
}

// Shows all parts except the given ones. Paths that do not exist are ignored.
export function setHiddenParts(root, paths) {
  const hidden = new Set(paths);
  const apply = (nodes) => nodes.forEach((node) => {
    node.object.visible = !hidden.has(node.path);
    apply(node.children);
  });
  apply(partNodes(root));
}

// Shows only the object and hides the other parts
export function showOnly(root, object) {
  setHiddenParts(root, []);
  for (let current = object; current && current !== root; current = current.parent) {
    for (const sibling of current.parent.children) {
      if (sibling !== current) sibling.visible = false;
    }
  }
}

// Box of the meshes that are shown
export function visibleBox(root) {
  const box = new THREE.Box3();
  root.updateWorldMatrix(true, true);
  root.traverse((object) => {
    if ((object.isMesh || object.isPoints || object.isLine) && isShown(object, root)) {
      box.expandByObject(object);
    }
  });
  return box;
}
