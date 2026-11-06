import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { fractionOf, positionAt, sectionPlane } from '../src/section_view.js';

test('the plane keeps the side below the position, or above it if flipped', () => {
  const plane = sectionPlane('x', 2, false);
  assert.ok(plane.distanceToPoint(new THREE.Vector3(1, 0, 0)) > 0);
  assert.ok(plane.distanceToPoint(new THREE.Vector3(3, 0, 0)) < 0);

  const flipped = sectionPlane('z', 2, true);
  assert.ok(flipped.distanceToPoint(new THREE.Vector3(0, 0, 3)) > 0);
  assert.ok(flipped.distanceToPoint(new THREE.Vector3(0, 0, 1)) < 0);
  assert.equal(flipped.distanceToPoint(new THREE.Vector3(5, 5, 2)), 0);
});

test('positions and fractions of the box along an axis', () => {
  const box = new THREE.Box3(new THREE.Vector3(0, -10, 0), new THREE.Vector3(1, 10, 1));
  assert.equal(positionAt(box, 'y', 0.25), -5);
  assert.equal(fractionOf(box, 'y', -5), 0.25);
  assert.equal(fractionOf(box, 'y', 50), 1);
  assert.equal(fractionOf(new THREE.Box3(new THREE.Vector3(), new THREE.Vector3()), 'x', 0), 0.5);
});
