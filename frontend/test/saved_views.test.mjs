import test from 'node:test';
import assert from 'node:assert/strict';
import { opaqueBounds, fitSize, sameState, NAME_PATTERN, captureImage } from '../src/saved_views.js';

// Image data with the given opaque pixels
function imageData(width, height, opaque) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (const [x, y] of opaque) data[(y * width + x) * 4 + 3] = 255;
  return { data, width, height };
}

test('bounds of the opaque pixels', () => {
  assert.deepEqual(opaqueBounds(imageData(10, 8, [[2, 3], [6, 5], [4, 1]])), { x: 2, y: 1, width: 5, height: 5 });
  assert.deepEqual(opaqueBounds(imageData(4, 4, [[0, 0]])), { x: 0, y: 0, width: 1, height: 1 });
});

test('transparent image has no bounds', () => {
  assert.equal(opaqueBounds(imageData(4, 4, [])), null);
});

test('axes are composed after cropping, without enlarging model bounds', () => {
  const original = globalThis.document;
  const images = [];
  globalThis.document = {createElement: () => {
    const canvas = {width: 0, height: 0};
    canvas.getContext = () => ({getImageData: () => imageData(100, 80, [[40, 20], [59, 49]]),
      drawImage: (...args) => images.push(args)});
    return canvas;
  }};
  try {
    let drawn;
    const result = captureImage({canvas: {width:100, height:80}, drawTransparent() {},
      drawAxes(_context, width, height) { drawn = {width, height}; assert.equal(images.length, 1); }});
    assert.equal(result.width, 20); assert.equal(result.height, 30);
    assert.deepEqual(drawn, {width:20, height:30});
    assert.ok(sameState({axes:true}, {}));
    assert.ok(!sameState({axes:false}, {}));
  } finally { globalThis.document = original; }
});

test('size is scaled down to the maximum', () => {
  assert.deepEqual(fitSize(3200, 1000, 1600), { width: 1600, height: 500 });
  assert.deepEqual(fitSize(1000, 4000, 1600), { width: 400, height: 1600 });
  assert.deepEqual(fitSize(800, 600, 1600), { width: 800, height: 600 });
  assert.deepEqual(fitSize(10000, 1, 1600), { width: 1600, height: 1 });
});

test('names of views', () => {
  for (const name of ['front', 'Front', 'detail-1', 'top_2', 'a'.repeat(64)]) assert.ok(NAME_PATTERN.test(name), name);
  for (const name of ['', '-front', 'front view', 'ä', 'a'.repeat(65)]) assert.ok(!NAME_PATTERN.test(name), name);
});

test('same state with small differences and another aspect', () => {
  const state = { version: 1, projection: 'perspective', position: [4136.6101625757765, -4987.5101564722445, 0],
                  aspect: 1.9, material: 'original', wireframe: false };
  assert.ok(sameState(state, { ...state, position: [4136.6101625757765, -4987.510156472243, 1e-12], aspect: 1.2 }));
  assert.ok(!sameState(state, { ...state, position: [4136.7, -4987.5101564722445, 0] }));
  assert.ok(!sameState(state, { ...state, material: 'matte' }));
  assert.ok(!sameState(state, { ...state, wireframe: true }));
  assert.ok(!sameState(state, { ...state, zoom: 2 }));
});
