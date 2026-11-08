import test from 'node:test';
import assert from 'node:assert/strict';
import { PerspectiveCamera, OrthographicCamera } from 'three';
import { worldAxes, drawWorldAxes } from '../src/world_axes.js';

test('world axes follow camera orientation, not its position or projection', () => {
  for (const camera of [new PerspectiveCamera(), new OrthographicCamera()]) {
    camera.position.set(0, 0, 10); camera.lookAt(0, 0, 0);
    const axes = Object.fromEntries(worldAxes(camera).map(a => [a.label, a.direction]));
    assert.ok(axes.X.x > .999); assert.ok(axes.Y.y > .999); assert.ok(axes.Z.z > .999);
    camera.position.set(10, 0, 0); camera.lookAt(0, 0, 0);
    const rotated = Object.fromEntries(worldAxes(camera).map(a => [a.label, a.direction]));
    assert.ok(rotated.Z.x < -.999); assert.ok(rotated.X.z > .999);
  }
});

test('Z-up cameras retain the world axes, and all glyphs fit the destination', () => {
  const camera = new PerspectiveCamera();
  camera.up.set(0, 0, 1); camera.position.set(0, -10, 0); camera.lookAt(0, 0, 0);
  assert.ok(worldAxes(camera).find(a => a.label === 'Z').direction.y > .999);
  for (const [width, height, ratio] of [[320, 240, 1], [88, 88, 2], [24, 24, 1]]) {
    const labels = [];
    const context = new Proxy({}, {get: (_target, key) => key === 'fillText'
      ? (label, x, y) => labels.push({label, x, y}) : () => {}, set: () => true});
    drawWorldAxes(context, camera, width, height, ratio);
    assert.equal(labels.length, 3);
    for (const {x, y} of labels) assert.ok(x > 0 && x < width && y > 0 && y < height);
  }
});
