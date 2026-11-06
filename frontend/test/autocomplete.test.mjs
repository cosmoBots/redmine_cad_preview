import test from 'node:test';
import assert from 'node:assert/strict';
import { findContext, matching, suggestions, completion } from '../src/autocomplete.js';

const FILES = [{ id: 12, name: 'model.step', views: ['front', 'detail'] }, { id: 13, name: 'part.step', views: [] },
               { id: 14, name: 'drawing.dwg', views: ['plan'] }];
const at = (text) => findContext(text, text.length);

test('file typed in the macro', () => {
  assert.deepEqual(at('See {{cad_preview(mod'), { type: 'file', query: 'mod', start: 18 });
  assert.deepEqual(at('{{cad_preview('), { type: 'file', query: '', start: 14 });
  assert.deepEqual(at('{{cad_preview( front'), { type: 'file', query: 'front', start: 15 });
});

test('options and values typed after the file', () => {
  assert.deepEqual(at('{{cad_preview(model.step, '), { type: 'option', query: '', start: 26, file: 'model.step', used: [] });
  assert.deepEqual(at('{{cad_preview(model.step, png, he'),
                   { type: 'option', query: 'he', start: 31, file: 'model.step', used: ['png'] });
  assert.deepEqual(at('{{cad_preview(model.step, view=fr'), { type: 'view', query: 'fr', start: 31, file: 'model.step' });
  assert.deepEqual(at('{{cad_preview(12, height='), { type: 'height', query: '', start: 25, file: '12' });
});

test('nothing outside of the macro', () => {
  assert.equal(at('{{cad_preview(model.step)}} more'), null);
  assert.equal(at('{{thumbnail(model'), null);
  assert.equal(at('{{cad_preview(\nmodel'), null);
});

test('matching values, those starting with the query first', () => {
  const files = ['part.step', 'model.step', 'Model.stl', 'drawing.dwg', 'model.step'];
  assert.deepEqual(matching(files, 'mod'), ['model.step', 'Model.stl']);
  assert.deepEqual(matching(files, 'step'), ['model.step', 'part.step']);
  assert.deepEqual(matching(files, ''), ['drawing.dwg', 'model.step', 'Model.stl', 'part.step']);
  assert.equal(matching(files, '', 2).length, 2);
});

test('suggestions for files, options, views and heights', () => {
  assert.deepEqual(suggestions(at('{{cad_preview(st'), FILES), ['model.step', 'part.step']);
  assert.deepEqual(suggestions(at('{{cad_preview(model.step, '), FILES), ['view=', 'height=', 'png', 'readonly']);
  assert.deepEqual(suggestions(at('{{cad_preview(model.step, view=front, '), FILES), ['height=', 'png', 'readonly']);
  assert.deepEqual(suggestions(at('{{cad_preview(model.step, p'), FILES), ['png']);
  assert.deepEqual(suggestions(at('{{cad_preview(Model.STEP, view='), FILES), ['*', 'detail', 'front']);
  assert.deepEqual(suggestions(at('{{cad_preview(12, view=fr'), FILES), ['front']);
  assert.deepEqual(suggestions(at('{{cad_preview(part.step, view='), FILES), ['*']);
  assert.deepEqual(suggestions(at('{{cad_preview(model.step, height=5'), FILES), ['520']);
});

test('Enter closes the macro, Tab adds the next argument', () => {
  assert.equal(completion('model.step', 'Enter', ''), 'model.step)}}');
  assert.equal(completion('model.step', 'Enter', ' text'), 'model.step)}}');
  assert.equal(completion('model.step', 'Tab', ''), 'model.step, ');
  assert.equal(completion('front', 'Enter', ', png)}}'), 'front');
  assert.equal(completion('front', 'Tab', ', png)}}'), 'front');
  assert.equal(completion('png', 'Enter', ')}}'), 'png');
  assert.equal(completion('view=', 'Enter', ''), 'view=');
  assert.equal(completion('height=', 'Tab', ''), 'height=');
});
