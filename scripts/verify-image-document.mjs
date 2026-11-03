import assert from 'node:assert/strict';
import test from 'node:test';
import { createModuleLoader } from './test-module-loader.mjs';
const { load } = createModuleLoader();
const { assertImageDimensions, parseImageDocument, expandImageDocument, scaleImageDocument, imagePoint, applyChromaKey } = load('@/lib/creative/image-document');
const source = 'data:image/png;base64,aGVsbG8=';
const image = { id: 'image-1', kind: 'image', name: 'Original', src: source, x: 10, y: 20, width: 200, height: 100,
    visible: true, opacity: 1, brightness: 100, contrast: 100, warmth: 0, keyColor: null, keyTolerance: 35 };
const text = { id: 'text-1', kind: 'text', name: 'Headline', text: 'Cinema', x: 30, y: 40, fontSize: 20, color: '#ffffff', visible: true, opacity: 1 };
const doc = { version: 1, width: 400, height: 300, layers: [image, text] };
function parse(document = doc, mask = null) { return parseImageDocument(JSON.stringify({ document, mask })); }
test('image documents preserve editable layers and source data', () => {
    const parsed = parse();
    assert.equal(parsed.document.layers[0].src, source);
    assert.equal(parsed.document.layers[1].text, 'Cinema');
    assert.equal(parsed.mask, null);
});
test('document import rejects unknown formats, SVG, external images and duplicate layers', () => {
    assert.throws(() => parse({ ...doc, version: 2 }), /Unsupported/);
    for (const src of ['https://example.com/photo.png', 'data:image/svg+xml;base64,AAAA', 'javascript:alert(1)']) {
        assert.throws(() => parse({ ...doc, layers: [{ ...image, src }] }), /Invalid image layer/);
    }
    assert.throws(() => parse({ ...doc, layers: [image, image] }), /Invalid layer/);
});
test('document import bounds canvas, numeric inputs and layer count', () => {
    for (const [width, height] of [[0, 100], [9000, 10], [8192, 8192], [100.5, 20]]) assert.throws(() => assertImageDimensions(width, height));
    assert.throws(() => parse({ ...doc, layers: Array.from({ length: 25 }, (_, index) => ({ ...image, id: `image-${index}` })) }), /too many layers/);
    assert.throws(() => parse({ ...doc, layers: [{ ...image, opacity: 2 }] }), /Invalid layer/);
    assert.throws(() => parse({ ...doc, layers: [{ ...text, fontSize: -1 }] }), /Invalid text/);
});
test('mask import accepts only embedded raster data', () => {
    assert.equal(parse(doc, source).mask, source);
    assert.throws(() => parse(doc, 'https://example.com/mask.png'), /Invalid mask/);
});
test('expanding canvas centers all layers without altering original dimensions or source', () => {
    const expanded = expandImageDocument(doc, 600, 500);
    assert.equal(expanded.layers[0].x, 110); assert.equal(expanded.layers[1].y, 140);
    assert.equal(expanded.layers[0].width, 200); assert.equal(expanded.layers[0].src, source);
    assert.equal(doc.layers[0].x, 10); assert.equal(doc.width, 400);
    assert.throws(() => expandImageDocument(doc, 300, 500), /at least/);
});
test('upscale transforms canvas, image geometry and text consistently', () => {
    const scaled = scaleImageDocument(doc, 2);
    assert.equal(scaled.width, 800); assert.equal(scaled.height, 600);
    assert.equal(scaled.layers[0].width, 400); assert.equal(scaled.layers[0].x, 20);
    assert.equal(scaled.layers[1].fontSize, 40); assert.equal(scaled.layers[1].y, 80);
    assert.throws(() => scaleImageDocument(doc, 0.5), /between/);
    assert.throws(() => scaleImageDocument({ ...doc, width: 4096, height: 4096 }, 2), /16 megapixels/);
});
test('pointer coordinate mapping respects CSS-scaled canvas and clamps edges', () => {
    const rect = { left: 100, top: 50, width: 200, height: 100 };
    const point = imagePoint(200, 100, rect, 1000, 500);
    assert.equal(point.x, 500); assert.equal(point.y, 250);
    assert.equal(imagePoint(0, 1000, rect, 1000, 500).x, 0);
    assert.equal(imagePoint(0, 1000, rect, 1000, 500).y, 500);
});
test('color key removes chosen color and preserves unrelated pixels and existing transparency', () => {
    const pixels = new Uint8ClampedArray([0, 255, 0, 255, 255, 0, 0, 255, 0, 0, 255, 0]);
    applyChromaKey(pixels, '#00ff00', 10);
    assert.equal(pixels[3], 0); assert.equal(pixels[7], 255); assert.equal(pixels[11], 0);
    assert.throws(() => applyChromaKey(pixels, '#bad-color', 10));
    assert.throws(() => applyChromaKey(pixels, '#ffffff', -1));
});
const { extractMaskedPixels, fillMaskedPixels } = load('@/lib/creative/image-document');
test('manual mask extraction keeps selected colors/alpha and makes other pixels transparent', () => {
    const pixels = new Uint8ClampedArray([10,20,30,200,40,50,60,255]);
    const mask = new Uint8ClampedArray([255,255,255,255,0,0,0,255]);
    const result = extractMaskedPixels(pixels,2,1,mask);
    assert.equal(result[0],10); assert.equal(result[3],200); assert.equal(result[7],0);
    assert.equal(pixels[7],255);
});
test('local texture fill propagates adjacent pixels and leaves unmasked source unchanged', () => {
    const pixels = new Uint8ClampedArray([255,0,0,255,0,0,0,0,0,0,0,0]);
    const mask = new Uint8ClampedArray([0,0,0,255,255,255,255,255,255,255,255,255]);
    assert.equal(fillMaskedPixels(pixels,3,1,mask),2);
    for(let index=0;index<3;index++){assert.equal(pixels[index*4],255);assert.equal(pixels[index*4+3],255);}
});
test('local mask operations reject empty/all-source-less masks and mismatched dimensions', () => {
    assert.throws(()=>extractMaskedPixels(new Uint8ClampedArray(4),1,1,new Uint8ClampedArray(4)),/nonempty/);
    assert.throws(()=>fillMaskedPixels(new Uint8ClampedArray([1,2,3,255]),1,1,new Uint8ClampedArray([255,255,255,255])),/adjacent/);
    assert.throws(()=>fillMaskedPixels(new Uint8ClampedArray(4),2,1,new Uint8ClampedArray(4)),/match/);
});
