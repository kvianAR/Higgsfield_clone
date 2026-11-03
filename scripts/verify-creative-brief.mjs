import test from 'node:test';
import assert from 'node:assert/strict';
import { createModuleLoader } from './test-module-loader.mjs';
const { continuityBrief, storyBrief, moveShot } = createModuleLoader().load('@/lib/creative/brief');
test('Continuity retains only selected reference notes and never loses the scene', () => {
    const text = continuityBrief('Walk through rain.', [{ id: 'a', name: 'Mira', description: 'Blue coat, silver eyes', assetIds: ['portrait'] }]);
    assert.match(text, /Walk through rain/); assert.match(text, /Mira: Blue coat, silver eyes/);
    assert.equal(continuityBrief(' Scene ', []), 'Scene');
});
test('Storyboard handoff orders shots and scopes continuity to each shot', () => {
    const text = storyBrief([
        { id: 'b', title: 'Reveal', prompt: 'The city', order: 1, duration: 4, elementIds: [] },
        { id: 'a', title: 'Arrival', prompt: 'Train arrives', order: 0, duration: 6, elementIds: ['m'] },
    ], [{ id: 'm', name: 'Mira', description: 'Blue coat', assetIds: [] }]);
    assert.ok(text.indexOf('Arrival') < text.indexOf('Reveal'));
    assert.equal(text.match(/Mira: Blue coat/g).length, 1);
    assert.match(text, /\(6s\)/);
});
test('Reordering is immutable, reindexes, and does not wrap the first shot', () => {
    const original = [{ id: 'a', order: 0 }, { id: 'b', order: 1 }, { id: 'c', order: 2 }];
    const result = moveShot(original, 'b', -1);
    assert.deepEqual(Array.from(result, item => item.id), ['b', 'a', 'c']);
    assert.deepEqual(Array.from(result, item => item.order), [0, 1, 2]);
    assert.equal(original[0].id, 'a');
    assert.deepEqual(Array.from(moveShot(original, 'a', -1), item => item.id), ['a', 'b', 'c']);
});
