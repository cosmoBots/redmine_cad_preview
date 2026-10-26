import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { ModelAppearance, matteMaterial } from '../src/model_appearance.js';

test('matte preserves color, transparency and textures without changing source', () => {
  const source = new THREE.MeshStandardMaterial({ color: 0x4488aa, metalness: 1, roughness: 0.21, opacity: 0.6, transparent: true });
  const texture = new THREE.Texture();
  source.map = texture;
  const matte = matteMaterial(source);
  assert.equal(matte.metalness, 0);
  assert.equal(matte.roughness, 1);
  assert.equal(matte.color.getHex(), source.color.getHex());
  assert.equal(matte.map, texture);
  assert.equal(matte.opacity, 0.6);
  assert.equal(source.metalness, 1);
  assert.equal(source.roughness, 0.21);
});

test('shared materials are reused and original material arrays are restored', () => {
  const original = new THREE.MeshStandardMaterial({ metalness: 1 });
  const group = new THREE.Group();
  const first = new THREE.Mesh(new THREE.BoxGeometry(), original);
  const second = new THREE.Mesh(new THREE.BoxGeometry(), [original]);
  group.add(first, second);
  const appearance = new ModelAppearance(group);
  appearance.apply('matte');
  assert.equal(first.material, second.material[0]);
  assert.notEqual(first.material, original);
  appearance.apply('original');
  assert.equal(first.material, original);
  assert.equal(second.material[0], original);
});

test('physical clear coat is removed only from the matte clone', () => {
  const source = new THREE.MeshPhysicalMaterial({ clearcoat: 1 });
  assert.equal(matteMaterial(source).clearcoat, 0);
  assert.equal(source.clearcoat, 1);
});
