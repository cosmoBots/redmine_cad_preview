import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { readView, applyView } from '../src/view_state.js';

function fixture() {
  const viewer = {
    camera: new THREE.PerspectiveCamera(60, 2, 0.1, 500),
    canvas: { width: 1200, height: 600 }, element: { dataset: { materialMode: 'matte', lighting: 'studio' } },
    scene: { background: new THREE.Color('#f5f6f7') }, wireframe: false,
    controls: { target: new THREE.Vector3(1, 2, 3), enableDamping: true, update() {} },
    setProjection(mode, height) {
      this.camera = mode === 'orthographic'
        ? new THREE.OrthographicCamera(-height, height, height / 2, -height / 2)
        : new THREE.PerspectiveCamera();
    },
    setMaterialMode(value) { this.element.dataset.materialMode = value; },
    setLighting(value) { this.element.dataset.lighting = value; },
    toggleWireframe() { this.wireframe = !this.wireframe; },
    resize() { this.camera.updateProjectionMatrix(); }, render() {}
  };
  viewer.camera.position.set(10, 20, 30);
  viewer.camera.up.set(0, 0, 1);
  return viewer;
}

test('perspective state restores camera, target, appearance and damping without mutating saved data', () => {
  const viewer = fixture();
  const state = readView(viewer);
  const snapshot = JSON.stringify(state);
  viewer.camera.position.set(100, 0, 0);
  viewer.setMaterialMode('original');
  viewer.setLighting('original');
  viewer.toggleWireframe();
  applyView(viewer, state);
  assert.deepEqual(viewer.camera.position.toArray(), state.position);
  assert.deepEqual(viewer.controls.target.toArray(), state.target);
  assert.deepEqual(viewer.camera.up.toArray(), state.up);
  assert.equal(viewer.camera.fov, 60);
  assert.equal(viewer.element.dataset.materialMode, 'matte');
  assert.equal(viewer.element.dataset.lighting, 'studio');
  assert.equal(viewer.wireframe, false);
  assert.equal(viewer.controls.enableDamping, true);
  assert.equal(JSON.stringify(state), snapshot);
});

test('orthographic state preserves vertical frustum and zoom', () => {
  const viewer = fixture();
  const state = { ...readView(viewer), projection: 'orthographic', frustum_height: 25, zoom: 2, wireframe: true };
  applyView(viewer, state);
  assert.equal(viewer.camera.isOrthographicCamera, true);
  assert.equal(viewer.camera.top - viewer.camera.bottom, 25);
  assert.equal(viewer.camera.zoom, 2);
  assert.equal(viewer.wireframe, true);
  assert.equal(readView(viewer).projection, 'orthographic');
});

test('unsupported camera state version is not applied', () => {
  const viewer = fixture();
  const camera = viewer.camera;
  assert.throws(() => applyView(viewer, { version: 2 }), /Unsupported/);
  assert.equal(viewer.camera, camera);
});
