export const MAX_IMAGE_PIXELS = 16_777_216;
export const MAX_IMAGE_EDGE = 8192;
export const MAX_IMAGE_LAYERS = 24;
export const MAX_DOCUMENT_BYTES = 32 * 1024 * 1024;

export type ImageLayer = {
    id: string; kind: 'image'; name: string; src: string;
    x: number; y: number; width: number; height: number; opacity: number; visible: boolean;
    brightness: number; contrast: number; warmth: number; keyColor: string | null; keyTolerance: number;
};
export type TextLayer = {
    id: string; kind: 'text'; name: string; text: string;
    x: number; y: number; fontSize: number; color: string; opacity: number; visible: boolean;
};
export type EditorLayer = ImageLayer | TextLayer;
export type ImageDocument = { version: 1; width: number; height: number; layers: EditorLayer[] };
export type ImageEditorState = { document: ImageDocument; mask: string | null };

export function assertImageDimensions(width: number, height: number): void {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 ||
        width > MAX_IMAGE_EDGE || height > MAX_IMAGE_EDGE || width * height > MAX_IMAGE_PIXELS) {
        throw new Error('Image canvas must fit within 8192 pixels per edge and 16 megapixels.');
    }
}
function finite(value: unknown, min: number, max: number): value is number {
    return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}
export function isRasterDataUrl(value: unknown): value is string {
    return typeof value === 'string' && value.length <= 24 * 1024 * 1024 &&
        /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value);
}
export function parseImageDocument(raw: string): ImageEditorState {
    if (new TextEncoder().encode(raw).length > MAX_DOCUMENT_BYTES) throw new Error('Document exceeds the 32 MB limit.');
    let input: ImageEditorState;
    try { input = JSON.parse(raw); } catch { throw new Error('This is not a valid CINQRA image document.'); }
    const doc = input?.document;
    if (!doc || doc.version !== 1 || !Array.isArray(doc.layers) || doc.layers.length > MAX_IMAGE_LAYERS) {
        throw new Error('Unsupported image document or too many layers.');
    }
    assertImageDimensions(doc.width, doc.height);
    const ids = new Set<string>();
    for (const layer of doc.layers) {
        if (!layer || typeof layer.id !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(layer.id) || ids.has(layer.id) ||
            typeof layer.name !== 'string' || layer.name.length > 120 || typeof layer.visible !== 'boolean' ||
            !finite(layer.x, -32768, 32768) || !finite(layer.y, -32768, 32768) || !finite(layer.opacity, 0, 1)) {
            throw new Error('Invalid layer settings.');
        }
        ids.add(layer.id);
        if (layer.kind === 'image') {
            if (!isRasterDataUrl(layer.src) || !finite(layer.width, 1, MAX_IMAGE_EDGE) || !finite(layer.height, 1, MAX_IMAGE_EDGE) ||
                !finite(layer.brightness, 0, 200) || !finite(layer.contrast, 0, 200) || !finite(layer.warmth, -100, 100) ||
                !(layer.keyColor === null || /^#[0-9a-f]{6}$/i.test(layer.keyColor)) || !finite(layer.keyTolerance, 0, 255)) {
                throw new Error('Invalid image layer. Only embedded PNG, JPEG and WebP images are accepted.');
            }
            assertImageDimensions(Math.ceil(layer.width), Math.ceil(layer.height));
        } else if (layer.kind === 'text') {
            if (typeof layer.text !== 'string' || layer.text.length > 2000 || !finite(layer.fontSize, 4, 1024) || !/^#[0-9a-f]{6}$/i.test(layer.color)) {
                throw new Error('Invalid text layer.');
            }
        } else throw new Error('Unsupported layer type.');
    }
    if (input.mask !== null && !isRasterDataUrl(input.mask)) throw new Error('Invalid mask image.');
    return { document: doc, mask: input.mask };
}
export function expandImageDocument(doc: ImageDocument, width: number, height: number): ImageDocument {
    assertImageDimensions(width, height);
    if (width < doc.width || height < doc.height) throw new Error('Expand dimensions must be at least the current canvas size.');
    const dx = Math.floor((width - doc.width) / 2), dy = Math.floor((height - doc.height) / 2);
    return { ...doc, width, height, layers: doc.layers.map(layer => ({ ...layer, x: layer.x + dx, y: layer.y + dy })) };
}
export function scaleImageDocument(doc: ImageDocument, factor: number): ImageDocument {
    if (!finite(factor, 1, 4)) throw new Error('Scale must be between 1× and 4×.');
    const width = Math.round(doc.width * factor), height = Math.round(doc.height * factor);
    assertImageDimensions(width, height);
    return { ...doc, width, height, layers: doc.layers.map(layer => layer.kind === 'image'
        ? { ...layer, x: layer.x * factor, y: layer.y * factor, width: layer.width * factor, height: layer.height * factor }
        : { ...layer, x: layer.x * factor, y: layer.y * factor, fontSize: Math.min(1024, layer.fontSize * factor) }) };
}
export function imagePoint(clientX: number, clientY: number, rect: { left: number; top: number; width: number; height: number }, width: number, height: number) {
    if (rect.width <= 0 || rect.height <= 0) return { x: 0, y: 0 };
    return { x: Math.max(0, Math.min(width, (clientX - rect.left) * width / rect.width)),
        y: Math.max(0, Math.min(height, (clientY - rect.top) * height / rect.height)) };
}
/** Remove pixels near the chosen key color; transparent pixels retain transparency. */
export function applyChromaKey(pixels: Uint8ClampedArray, color: string, tolerance: number): void {
    if (!/^#[0-9a-f]{6}$/i.test(color) || !finite(tolerance, 0, 255)) throw new Error('Invalid color key settings.');
    const r = parseInt(color.slice(1, 3), 16), g = parseInt(color.slice(3, 5), 16), b = parseInt(color.slice(5, 7), 16);
    const threshold = tolerance * tolerance * 3;
    for (let index = 0; index < pixels.length; index += 4) {
        const distance = (pixels[index] - r) ** 2 + (pixels[index + 1] - g) ** 2 + (pixels[index + 2] - b) ** 2;
        if (distance <= threshold) pixels[index + 3] = 0;
    }
}

function selectedPixel(mask: Uint8ClampedArray, index: number): boolean {
    const offset = index * 4;
    return mask[offset + 3] >= 128 && mask[offset] + mask[offset + 1] + mask[offset + 2] >= 384;
}
function assertPixelBuffers(pixels: Uint8ClampedArray, width: number, height: number, mask: Uint8ClampedArray) {
    assertImageDimensions(width, height);
    if (pixels.length !== width * height * 4 || mask.length !== pixels.length) throw new Error('Mask and image dimensions must match.');
}
/** Manual layer separation: copy selected pixels and preserve their existing alpha. */
export function extractMaskedPixels(pixels: Uint8ClampedArray, width: number, height: number, mask: Uint8ClampedArray): Uint8ClampedArray {
    assertPixelBuffers(pixels, width, height, mask);
    const result = new Uint8ClampedArray(pixels.length);
    let count = 0;
    for (let index = 0; index < width * height; index++) if (selectedPixel(mask, index)) {
        result.set(pixels.subarray(index * 4, index * 4 + 4), index * 4); count++;
    }
    if (!count) throw new Error('Paint a nonempty mask first.');
    return result;
}
/** Local nearest-neighbor texture fill. Copies adjacent visible pixels; this is not generative AI. */
export function fillMaskedPixels(pixels: Uint8ClampedArray, width: number, height: number, mask: Uint8ClampedArray): number {
    assertPixelBuffers(pixels, width, height, mask);
    const total = width * height, selection = new Uint8Array(total), filled = new Uint8Array(total), queue = new Uint32Array(total);
    let count = 0, tail = 0;
    for (let index = 0; index < total; index++) {
        selection[index] = selectedPixel(mask, index) ? 1 : 0;
        if (selection[index]) count++;
        else if (pixels[index * 4 + 3] > 0) filled[index] = 1;
    }
    if (!count) throw new Error('Paint a nonempty mask first.');
    const neighbors = (index: number) => [index % width > 0 ? index - 1 : -1, index % width < width - 1 ? index + 1 : -1,
        index >= width ? index - width : -1, index + width < total ? index + width : -1];
    // Seed only from original unmasked pixels, so propagation does not depend on scan direction.
    for (let index = 0; index < total; index++) if (selection[index]) {
        const source = neighbors(index).find(other => other >= 0 && !selection[other] && filled[other]);
        if (source !== undefined) {
            pixels.set(pixels.subarray(source * 4, source * 4 + 4), index * 4); filled[index] = 1; queue[tail++] = index;
        }
    }
    if (!tail) throw new Error('The selected area needs an adjacent visible, unmasked source pixel.');
    let head = 0;
    while (head < tail) {
        const source = queue[head++];
        for (const index of neighbors(source)) if (index >= 0 && selection[index] && !filled[index]) {
            pixels.set(pixels.subarray(source * 4, source * 4 + 4), index * 4); filled[index] = 1; queue[tail++] = index;
        }
    }
    return tail;
}
