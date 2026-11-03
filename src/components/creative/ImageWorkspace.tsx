'use client';

import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { applyChromaKey, assertImageDimensions, expandImageDocument, imagePoint, isRasterDataUrl, extractMaskedPixels, fillMaskedPixels,
    MAX_DOCUMENT_BYTES, MAX_IMAGE_LAYERS, parseImageDocument, scaleImageDocument,
    type EditorLayer, type ImageDocument, type ImageEditorState, type ImageLayer, type TextLayer } from '@/lib/creative/image-document';
import './image-workspace.css';

type Props = { onSave?: (file: File) => Promise<void>; onAI?: (operation: string, source: File, mask?: File) => void };
const initial: ImageEditorState = { document: { version: 1, width: 1024, height: 1024, layers: [] }, mask: null };
function rasterImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('The embedded image could not be decoded.')); image.src = src; });
}
function readImage(file: File): Promise<string> {
    if (file.size > 12 * 1024 * 1024 || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
        return Promise.reject(new Error('Choose PNG, JPEG or WebP up to 12 MB.'));
    }
    return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => {
        const value = String(reader.result); if (isRasterDataUrl(value)) resolve(value); else reject(new Error('Unsupported image file.'));
    }; reader.onerror = () => reject(new Error('Could not read the selected file.')); reader.readAsDataURL(file); });
}
async function renderDocument(doc: ImageDocument, cancelled: () => boolean = () => false): Promise<HTMLCanvasElement> {
    assertImageDimensions(doc.width, doc.height);
    const canvas = document.createElement('canvas'); canvas.width = doc.width; canvas.height = doc.height;
    const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Canvas rendering is unavailable.');
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    for (const layer of doc.layers) {
        if (cancelled()) throw new Error('Render superseded.');
        if (!layer.visible) continue;
        ctx.save(); ctx.globalAlpha = layer.opacity;
        if (layer.kind === 'text') {
            ctx.fillStyle = layer.color; ctx.font = `600 ${layer.fontSize}px system-ui, sans-serif`; ctx.textBaseline = 'top';
            layer.text.split('\n').forEach((line, index) => ctx.fillText(line, layer.x, layer.y + index * layer.fontSize * 1.2));
        } else {
            const image = await rasterImage(layer.src);
            if (cancelled()) throw new Error('Render superseded.');
            assertImageDimensions(image.naturalWidth, image.naturalHeight);
            const tile = document.createElement('canvas'); tile.width = Math.ceil(layer.width); tile.height = Math.ceil(layer.height);
            assertImageDimensions(tile.width, tile.height);
            const tileCtx = tile.getContext('2d', { willReadFrequently: true });
            if (!tileCtx) throw new Error('Canvas rendering is unavailable.');
            tileCtx.imageSmoothingEnabled = true; tileCtx.imageSmoothingQuality = 'high';
            tileCtx.drawImage(image, 0, 0, tile.width, tile.height);
            if (layer.brightness !== 100 || layer.contrast !== 100 || layer.warmth !== 0 || layer.keyColor) {
                const pixels = tileCtx.getImageData(0, 0, tile.width, tile.height);
                if (layer.keyColor) applyChromaKey(pixels.data, layer.keyColor, layer.keyTolerance);
                for (let index = 0; index < pixels.data.length; index += 4) {
                    const brightness = layer.brightness / 100, contrast = layer.contrast / 100;
                    for (let channel = 0; channel < 3; channel++) pixels.data[index + channel] =
                        (pixels.data[index + channel] * brightness - 128) * contrast + 128 + (channel === 0 ? layer.warmth * 0.35 : channel === 2 ? -layer.warmth * 0.35 : 0);
                }
                tileCtx.putImageData(pixels, 0, 0);
            }
            ctx.drawImage(tile, layer.x, layer.y, layer.width, layer.height);
        }
        ctx.restore();
    }
    return canvas;
}
function canvasFile(canvas: HTMLCanvasElement, name: string): Promise<File> {
    return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(new File([blob], name, { type: 'image/png' }))
        : reject(new Error('Could not export this canvas.')), 'image/png'));
}
function downloadBlob(blob: Blob, name: string) {
    const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function ImageWorkspace({ onSave, onAI }: Props) {
    const [state, setState] = useState<ImageEditorState>(initial);
    const [selected, setSelected] = useState<string | null>(null);
    const [tool, setTool] = useState<'select' | 'paint' | 'erase'>('select');
    const [brush, setBrush] = useState(42);
    const [dimensions, setDimensions] = useState({ width: 1280, height: 1280 });
    const [undoStack, setUndoStack] = useState<ImageEditorState[]>([]);
    const [redoStack, setRedoStack] = useState<ImageEditorState[]>([]);
    const [status, setStatus] = useState('Upload an image or add a text layer to begin.');
    const [busy, setBusy] = useState(false);
    const canvasRef = useRef<HTMLCanvasElement>(null), maskRef = useRef<HTMLCanvasElement>(null);
    const transaction = useRef<{ before: ImageEditorState; start: { x: number; y: number }; layer?: EditorLayer } | null>(null);
    const latest = useRef(state);
    useEffect(() => { latest.current = state; }, [state]);
    const layer = state.document.layers.find(item => item.id === selected);
    const hasImage = state.document.layers.some(item => item.kind === 'image');

    useEffect(() => {
        let cancelled = false;
        void renderDocument(state.document, () => cancelled).then(rendered => {
            if (cancelled || !canvasRef.current) return;
            const canvas = canvasRef.current; canvas.width = rendered.width; canvas.height = rendered.height;
            canvas.getContext('2d')?.drawImage(rendered, 0, 0);
        }).catch(error => { if (!cancelled) setStatus(error.message); });
        return () => { cancelled = true; };
    }, [state.document]);
    useEffect(() => {
        const canvas = maskRef.current; if (!canvas) return;
        canvas.width = state.document.width; canvas.height = state.document.height;
        let cancelled = false;
        if (state.mask) void rasterImage(state.mask).then(image => { if (!cancelled) canvas.getContext('2d')?.drawImage(image, 0, 0); })
            .catch(() => { if (!cancelled) setStatus('Could not restore the mask.'); });
        return () => { cancelled = true; };
    }, [state.mask, state.document.width, state.document.height]);

    function change(next: ImageEditorState) {
        const encoded = JSON.stringify(next);
        if (encoded.length > MAX_DOCUMENT_BYTES) { setStatus('Document is too large. Remove an image layer before continuing.'); return; }
        setUndoStack(current => [...current.slice(-14), latest.current]); setRedoStack([]); setState(next);
    }
    function updateLayer(patch: Partial<EditorLayer>) {
        if (!layer) return;
        change({ ...state, document: { ...state.document, layers: state.document.layers.map(item => item.id === layer.id ? { ...item, ...patch } as EditorLayer : item) } });
    }
    function undo() {
        const previous = undoStack.at(-1); if (!previous) return;
        setRedoStack(current => [...current.slice(-14), state]); setUndoStack(current => current.slice(0, -1)); setState(previous);
    }
    function redo() {
        const next = redoStack.at(-1); if (!next) return;
        setUndoStack(current => [...current.slice(-14), state]); setRedoStack(current => current.slice(0, -1)); setState(next);
    }
    async function addImage(file?: File) {
        if (!file) return;
        if (state.document.layers.length >= MAX_IMAGE_LAYERS) { setStatus('Maximum 24 layers per document.'); return; }
        setBusy(true);
        try {
            const src = await readImage(file), image = await rasterImage(src);
            assertImageDimensions(image.naturalWidth, image.naturalHeight);
            const empty = state.document.layers.length === 0, width = empty ? image.naturalWidth : state.document.width;
            const height = empty ? image.naturalHeight : state.document.height;
            const scale = Math.min(1, width / image.naturalWidth, height / image.naturalHeight);
            const nextLayer: ImageLayer = { id: crypto.randomUUID(), kind: 'image', name: file.name.slice(0, 120), src,
                x: (width - image.naturalWidth * scale) / 2, y: (height - image.naturalHeight * scale) / 2,
                width: image.naturalWidth * scale, height: image.naturalHeight * scale, opacity: 1, visible: true,
                brightness: 100, contrast: 100, warmth: 0, keyColor: null, keyTolerance: 35 };
            change({ document: { ...state.document, width, height, layers: [...state.document.layers, nextLayer] }, mask: empty ? null : state.mask });
            setSelected(nextLayer.id); setDimensions({ width: Math.ceil(width * 1.25), height: Math.ceil(height * 1.25) });
            setStatus('Image added. Your original file stays unchanged.');
        } catch (error) { setStatus((error as Error).message); } finally { setBusy(false); }
    }
    function addText() {
        if (state.document.layers.length >= MAX_IMAGE_LAYERS) { setStatus('Maximum 24 layers per document.'); return; }
        const text: TextLayer = { id: crypto.randomUUID(), kind: 'text', name: 'Text layer', text: 'Cinema, Reimagined.',
            x: 40, y: 40, fontSize: Math.max(4, Math.min(60, Math.round(state.document.width / 15))), color: '#ffffff', opacity: 1, visible: true };
        change({ ...state, document: { ...state.document, layers: [...state.document.layers, text] } }); setSelected(text.id); setTool('select');
    }
    function point(event: PointerEvent<HTMLCanvasElement>) {
        return imagePoint(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect(), state.document.width, state.document.height);
    }
    function stroke(x: number, y: number, previous?: { x: number; y: number }) {
        const context = maskRef.current?.getContext('2d'); if (!context) return;
        context.globalCompositeOperation = tool === 'erase' ? 'destination-out' : 'source-over';
        context.strokeStyle = '#ffffff'; context.fillStyle = '#ffffff'; context.lineWidth = brush; context.lineCap = 'round'; context.lineJoin = 'round';
        if (previous) { context.beginPath(); context.moveTo(previous.x, previous.y); context.lineTo(x, y); context.stroke(); }
        else { context.beginPath(); context.arc(x, y, brush / 2, 0, Math.PI * 2); context.fill(); }
    }
    function pointerDown(event: PointerEvent<HTMLCanvasElement>) {
        if (busy) return; event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
        const start = point(event); transaction.current = { before: latest.current, start, layer };
        if (tool !== 'select') stroke(start.x, start.y);
    }
    function pointerMove(event: PointerEvent<HTMLCanvasElement>) {
        const active = transaction.current; if (!active) return; const current = point(event);
        if (tool !== 'select') { stroke(current.x, current.y, active.start); active.start = current; }
        else if (active.layer) {
            const { layer: original, start } = active;
            setState(previous => ({ ...previous, document: { ...previous.document, layers: previous.document.layers.map(item => item.id === original.id
                ? { ...item, x: Math.round(original.x + current.x - start.x), y: Math.round(original.y + current.y - start.y) } : item) } }));
        }
    }
    function pointerUp(event: PointerEvent<HTMLCanvasElement>) {
        const active = transaction.current; if (!active) return;
        transaction.current = null;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        if (tool !== 'select') setState(previous => ({ ...previous, mask: maskRef.current?.toDataURL('image/png') ?? null }));
        setUndoStack(current => [...current.slice(-14), active.before]); setRedoStack([]);
    }
    async function transform(kind: 'expand' | 'upscale') {
        setBusy(true);
        try {
            const doc = kind === 'expand' ? expandImageDocument(state.document, dimensions.width, dimensions.height) : scaleImageDocument(state.document, 2);
            let mask: string | null = null;
            if (state.mask) {
                const image = await rasterImage(state.mask), canvas = document.createElement('canvas'); canvas.width = doc.width; canvas.height = doc.height;
                const ctx = canvas.getContext('2d');
                if (kind === 'expand') ctx?.drawImage(image, Math.floor((doc.width - state.document.width) / 2), Math.floor((doc.height - state.document.height) / 2));
                else ctx?.drawImage(image, 0, 0, doc.width, doc.height);
                mask = canvas.toDataURL('image/png');
            }
            change({ document: doc, mask }); setStatus(kind === 'expand' ? 'Canvas expanded with transparency. Use AI outpaint to generate the empty area.' : 'Canvas upscaled 2× with local interpolation. AI detail generation is separate.');
        } catch (error) { setStatus((error as Error).message); } finally { setBusy(false); }
    }
    async function localMaskOperation(operation: 'fill' | 'extract' | 'expand-fill') {
        setBusy(true);
        try {
            if (state.document.layers.length >= MAX_IMAGE_LAYERS) throw new Error('Maximum 24 layers per document.');
            const source = await renderDocument(state.document), context = source.getContext('2d');
            if (!context) throw new Error('Canvas rendering is unavailable.');
            const pixels = context.getImageData(0, 0, source.width, source.height);
            const maskCanvas = document.createElement('canvas'); maskCanvas.width = source.width; maskCanvas.height = source.height;
            const maskContext = maskCanvas.getContext('2d'); if (!maskContext) throw new Error('Canvas rendering is unavailable.');
            if (operation === 'expand-fill') {
                const maskPixels = maskContext.createImageData(source.width, source.height);
                for (let index = 0; index < pixels.data.length; index += 4) {
                    const select = pixels.data[index + 3] < 10;
                    maskPixels.data[index] = maskPixels.data[index + 1] = maskPixels.data[index + 2] = select ? 255 : 0;
                    maskPixels.data[index + 3] = 255;
                }
                maskContext.putImageData(maskPixels, 0, 0);
            } else {
                if (!state.mask) throw new Error('Paint a nonempty mask first.');
                maskContext.drawImage(await rasterImage(state.mask), 0, 0);
            }
            const mask = maskContext.getImageData(0, 0, source.width, source.height);
            if (operation === 'extract') pixels.data.set(extractMaskedPixels(pixels.data, source.width, source.height, mask.data));
            else fillMaskedPixels(pixels.data, source.width, source.height, mask.data);
            context.putImageData(pixels, 0, 0);
            const result: ImageLayer = { id: crypto.randomUUID(), kind: 'image', name: operation === 'extract' ? 'Mask extraction' : 'Local texture fill',
                src: source.toDataURL('image/png'), x: 0, y: 0, width: source.width, height: source.height, visible: true, opacity: 1,
                brightness: 100, contrast: 100, warmth: 0, keyColor: null, keyTolerance: 35 };
            const layers = operation === 'extract' ? [...state.document.layers, result]
                : [...state.document.layers.map(item => ({ ...item, visible: false })), result];
            change({ document: { ...state.document, layers }, mask: null }); setSelected(result.id);
            setStatus(operation === 'extract' ? 'Selected pixels extracted into an editable image layer. Original layers are preserved.'
                : 'Local texture fill copied nearby pixels into the selected area. This is not generative AI; originals remain hidden below.');
        } catch (error) { setStatus((error as Error).message); } finally { setBusy(false); }
    }
    async function exportImage(save = false) {
        setBusy(true);
        try {
            const file = await canvasFile(await renderDocument(state.document), 'cinqra-composition.png');
            if (save && onSave) { await onSave(file); setStatus('Composition saved to the asset library.'); }
            else { downloadBlob(file, file.name); setStatus('PNG exported with visible layers and transparency.'); }
        } catch (error) { setStatus((error as Error).message); } finally { setBusy(false); }
    }
    async function runAI(operation: string) {
        if (!onAI) { setStatus('AI workflows are not connected in this window.'); return; }
        if (!hasImage) { setStatus('Add an image layer first.'); return; }
        if (operation === 'inpaint' && !state.mask) { setStatus('Paint a mask over the area you want AI to replace first.'); return; }
        setBusy(true);
        try {
            const composition = await renderDocument(state.document);
            const source = await canvasFile(composition, 'cinqra-source.png');
            let mask: File | undefined;
            if (operation === 'inpaint' && maskRef.current) {
                const ctx = maskRef.current.getContext('2d');
                const pixels = ctx?.getImageData(0, 0, maskRef.current.width, maskRef.current.height).data;
                if (!pixels?.some((alpha, index) => index % 4 === 3 && alpha > 0)) throw new Error('The mask is empty. Paint the area to edit first.');
                mask = await canvasFile(maskRef.current, 'cinqra-mask.png');
            }
            if (operation === 'outpaint') {
                const ctx = composition.getContext('2d'), pixels = ctx?.getImageData(0, 0, composition.width, composition.height);
                if (!ctx || !pixels) throw new Error('Could not prepare the outpaint mask.');
                let empty = false;
                for (let index = 0; index < pixels.data.length; index += 4) {
                    const transparent = pixels.data[index + 3] < 10;
                    pixels.data[index] = pixels.data[index + 1] = pixels.data[index + 2] = transparent ? 255 : 0;
                    pixels.data[index + 3] = 255; if (transparent) empty = true;
                }
                if (!empty) throw new Error('Expand the canvas before outpainting. The new transparent area becomes the AI mask.');
                ctx.putImageData(pixels, 0, 0); mask = await canvasFile(composition, 'cinqra-outpaint-mask.png');
            }
            onAI(operation, source, mask); setStatus('Source prepared. Review the AI workflow before submitting a paid request.');
        } catch (error) { setStatus((error as Error).message); } finally { setBusy(false); }
    }
    async function importDocument(file?: File) {
        if (!file) return;
        if (file.size > MAX_DOCUMENT_BYTES) { setStatus('Document exceeds the 32 MB limit.'); return; }
        try {
            const next = parseImageDocument(await file.text());
            if (next.mask) { const mask = await rasterImage(next.mask); assertImageDimensions(mask.naturalWidth, mask.naturalHeight);
                if (mask.naturalWidth !== next.document.width || mask.naturalHeight !== next.document.height) throw new Error('Mask dimensions must match the document.'); }
            // Decode every embedded image before accepting the imported document.
            for (const item of next.document.layers) if (item.kind === 'image') {
                const image = await rasterImage(item.src); assertImageDimensions(image.naturalWidth, image.naturalHeight);
            }
            change(next); setSelected(next.document.layers.at(-1)?.id ?? null); setStatus('Image document imported.');
        } catch (error) { setStatus((error as Error).message); }
    }
    function reorder(direction: number) {
        if (!layer) return; const layers = [...state.document.layers], index = layers.findIndex(item => item.id === layer.id), target = index + direction;
        if (target < 0 || target >= layers.length) return; [layers[index], layers[target]] = [layers[target], layers[index]];
        change({ ...state, document: { ...state.document, layers } });
    }
    return <section className="image-workspace" aria-label="Image and layers workspace">
        <div className="iw-heading"><div><span className="eyebrow">IMAGE WORKSPACE</span><h2>Every detail, in your hands.</h2><p>Paint masks, compose layers and prepare edits. AI tools open a separate review step.</p></div>
            <div className="iw-actions"><button disabled={busy || !undoStack.length} onClick={undo}>Undo</button><button disabled={busy || !redoStack.length} onClick={redo}>Redo</button>
                <button disabled={busy} onClick={() => void exportImage()}>Export PNG</button>{onSave && <button disabled={busy} onClick={() => void exportImage(true)}>Save to library</button>}</div></div>
        <div className="iw-layout"><aside className="iw-panel">
            <h3>Sources & layers</h3><label className="iw-file">Add image<input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={event => { void addImage(event.target.files?.[0]); event.target.value = ''; }} /></label>
            <button disabled={busy} onClick={addText}>Add text layer</button>
            <ol className="iw-layers">{[...state.document.layers].reverse().map(item => <li key={item.id}>
                <button className={selected === item.id ? 'selected' : ''} onClick={() => setSelected(item.id)}>{item.kind === 'text' ? 'T' : '▧'} {item.name}</button>
                <button aria-label={`${item.visible ? 'Hide' : 'Show'} ${item.name}`} onClick={() => change({ ...state, document: { ...state.document, layers: state.document.layers.map(value => value.id === item.id ? { ...value, visible: !value.visible } : value) } })}>{item.visible ? '●' : '○'}</button>
            </li>)}</ol>
            {!state.document.layers.length && <p className="iw-help">Your original image remains unchanged. Each upload becomes an independent layer.</p>}
            {layer && <div className="iw-layer-controls"><label>Layer name<input aria-label="Layer name" maxLength={120} value={layer.name} onChange={event => updateLayer({ name: event.target.value })} /></label>
                <div className="iw-pair"><label>X<input aria-label="Layer X" type="number" min={-32768} max={32768} value={Math.round(layer.x)} onChange={event => updateLayer({ x: Math.max(-32768, Math.min(32768, Number(event.target.value))) })} /></label>
                    <label>Y<input aria-label="Layer Y" type="number" min={-32768} max={32768} value={Math.round(layer.y)} onChange={event => updateLayer({ y: Math.max(-32768, Math.min(32768, Number(event.target.value))) })} /></label></div>
                <label>Opacity {Math.round(layer.opacity * 100)}%<input aria-label="Layer opacity" type="range" min="0" max="1" step="0.05" value={layer.opacity} onChange={event => updateLayer({ opacity: Number(event.target.value) })} /></label>
                {layer.kind === 'text' ? <><label>Editable text<textarea aria-label="Text layer content" maxLength={2000} value={layer.text} onChange={event => updateLayer({ text: event.target.value } as Partial<TextLayer>)} /></label>
                    <label>Font size<input aria-label="Text font size" type="number" min="4" max="1024" value={layer.fontSize} onChange={event => updateLayer({ fontSize: Math.max(4, Math.min(1024, Number(event.target.value))) } as Partial<TextLayer>)} /></label>
                    <label>Text color<input aria-label="Text color" type="color" value={layer.color} onChange={event => updateLayer({ color: event.target.value } as Partial<TextLayer>)} /></label></>
                    : <><div className="iw-pair"><label>Width<input aria-label="Layer width" type="number" min="1" max="8192" value={Math.round(layer.width)} onChange={event => updateLayer({ width: Math.max(1, Math.min(8192, Number(event.target.value))) } as Partial<ImageLayer>)} /></label>
                        <label>Height<input aria-label="Layer height" type="number" min="1" max="8192" value={Math.round(layer.height)} onChange={event => updateLayer({ height: Math.max(1, Math.min(8192, Number(event.target.value))) } as Partial<ImageLayer>)} /></label></div>
                        <h4>Local relight adjustment</h4>{(['brightness', 'contrast', 'warmth'] as const).map(key => <label key={key}>{key} {layer[key]}<input aria-label={`Image ${key}`} type="range" min={key === 'warmth' ? -100 : 0} max={key === 'warmth' ? 100 : 200} value={layer[key]} onChange={event => updateLayer({ [key]: Number(event.target.value) } as Partial<ImageLayer>)} /></label>)}
                        <h4>Local color-key background removal</h4><label className="iw-check"><input type="checkbox" aria-label="Enable color key" checked={Boolean(layer.keyColor)} onChange={event => updateLayer({ keyColor: event.target.checked ? '#00ff00' : null } as Partial<ImageLayer>)} />Enable color key</label>
                        {layer.keyColor && <><label>Remove color<input type="color" aria-label="Background key color" value={layer.keyColor} onChange={event => updateLayer({ keyColor: event.target.value } as Partial<ImageLayer>)} /></label>
                            <label>Tolerance {layer.keyTolerance}<input type="range" aria-label="Background key tolerance" min="0" max="255" value={layer.keyTolerance} onChange={event => updateLayer({ keyTolerance: Number(event.target.value) } as Partial<ImageLayer>)} /></label></>}
                    </>}
                <div className="iw-actions"><button onClick={() => reorder(1)}>Move up</button><button onClick={() => reorder(-1)}>Move down</button></div>
                <button className="iw-danger" onClick={() => { change({ ...state, document: { ...state.document, layers: state.document.layers.filter(item => item.id !== layer.id) } }); setSelected(null); }}>Delete selected layer</button>
            </div>}
        </aside><div className="iw-stage-area"><div className="iw-toolbar"><div role="group" aria-label="Canvas tool">{(['select', 'paint', 'erase'] as const).map(value => <button key={value} aria-pressed={tool === value} className={tool === value ? 'selected' : ''} onClick={() => setTool(value)}>{value === 'select' ? 'Move layer' : value === 'paint' ? 'Paint mask' : 'Erase mask'}</button>)}</div>
            <label>Brush {brush}px<input aria-label="Mask brush size" type="range" min="4" max="300" value={brush} onChange={event => setBrush(Number(event.target.value))} /></label>
            <button disabled={!state.mask} onClick={() => change({ ...state, mask: null })}>Clear mask</button>
            <button disabled={!state.mask} onClick={() => { if (maskRef.current) void canvasFile(maskRef.current, 'cinqra-mask.png').then(file => downloadBlob(file, file.name)); }}>Export mask</button></div>
            <div className="iw-stage-scroll"><div className="iw-stage" style={{ aspectRatio: `${state.document.width} / ${state.document.height}`, maxWidth: Math.min(state.document.width, 1000) }}>
                <canvas ref={canvasRef} aria-label="Layer composition preview" /><canvas ref={maskRef} className={`iw-mask ${tool}`} aria-label="Mask painting surface" onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp} />
            </div></div><div className="iw-dimensions">{state.document.width} × {state.document.height}px · {state.document.layers.length} layers · White overlay marks the AI edit area.</div>
            <div className="iw-actions iw-local-mask"><button disabled={busy || !state.mask || !hasImage} onClick={() => void localMaskOperation('fill')}>Local texture fill mask</button><button disabled={busy || !state.mask || !hasImage} onClick={() => void localMaskOperation('extract')}>Extract mask to new layer</button><button disabled={busy || !hasImage} onClick={() => void localMaskOperation('expand-fill')}>Fill transparent area locally</button></div>
            <p className="iw-status" role="status">{busy ? 'Preparing image…' : status}</p>
            <div className="iw-bottom"><div><h3>Expand & upscale</h3><div className="iw-pair"><label>Canvas width<input aria-label="Expand canvas width" type="number" min={state.document.width} max="8192" value={dimensions.width} onChange={event => setDimensions(current => ({ ...current, width: Number(event.target.value) }))} /></label>
                <label>Canvas height<input aria-label="Expand canvas height" type="number" min={state.document.height} max="8192" value={dimensions.height} onChange={event => setDimensions(current => ({ ...current, height: Number(event.target.value) }))} /></label></div>
                <div className="iw-actions"><button disabled={busy} onClick={() => void transform('expand')}>Expand transparent canvas</button><button disabled={busy} onClick={() => void transform('upscale')}>Local upscale 2×</button></div>
                <p className="iw-help">Local upscale interpolates pixels. AI outpaint and AI detail enhancement require a connected supported workflow.</p></div>
                <div><h3>Portable image document</h3><button onClick={() => downloadBlob(new Blob([JSON.stringify(state)], { type: 'application/json' }), 'cinqra-image-document.json')}>Export layers JSON</button>
                    <label className="iw-file">Import layers JSON<input type="file" accept="application/json,.json" onChange={event => { void importDocument(event.target.files?.[0]); event.target.value = ''; }} /></label><p className="iw-help">Embedded images and text stay editable. Maximum 24 layers, 32 MB document.</p></div></div>
        </div><aside className="iw-panel iw-ai"><h3>AI image tools</h3><p className="iw-help">Choose a tool, then review its model, inputs and API availability. No automatic paid generation.</p>
            {[
                ['inpaint', 'Inpaint masked area'], ['outpaint', 'AI outpaint / expand'], ['background-removal', 'AI background removal'],
                ['relight', 'AI relight'], ['upscale', 'AI upscale'], ['text-edit', 'Replace text in image'], ['layers-decompose', 'AI layer decomposition'],
            ].map(([id, label]) => <button key={id} disabled={busy || !hasImage || !onAI} onClick={() => void runAI(id)}>{label}</button>)}
            <p className="iw-help">Adding text layers overlays new text. Replacing text already inside a photo requires AI editing. Existing image pixels are not automatically separated into layers.</p>
        </aside></div>
    </section>;
}
