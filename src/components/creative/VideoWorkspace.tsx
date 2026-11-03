'use client';

import { useEffect, useState } from 'react';
import type { CreativeAsset } from '@/lib/creative/workspace-types';
import type { VideoRenderSettings } from '@/lib/creative/video-render';
import './image-workspace.css';

type Props = { onSaved?: (asset: CreativeAsset) => void; assets?: Pick<CreativeAsset, 'id' | 'name' | 'mimeType' | 'url'>[] };
const defaults: VideoRenderSettings = { start: 0, end: 5, ratio: 'source', height: 720, fit: 'contain', freeze: 0, volume: 1 };
const errors: Record<string, string> = {
    ERR_VIDEO_SETTINGS: 'Check the video settings. Trim must be positive and fit within 60 seconds.',
    ERR_VIDEO_DURATION: 'Choose a trim range between 0.05 and 60 seconds. Freeze tail can add up to 15 seconds.',
    ERR_VIDEO_RENDER_BUSY: 'Another local video export is running. Try again when it finishes.',
    ERR_VIDEO_RENDER_FAILED: 'The video could not be decoded or rendered. Try a standard MP4/WebM and a valid trim range.',
    ERR_VIDEO_RENDER_TIMEOUT: 'Rendering took too long. Choose a shorter clip or lower output resolution.',
    ERR_VIDEO_RENDER_CANCELLED: 'The local video render was cancelled.',
    ERR_FFMPEG_NOT_AVAILABLE: 'The local video engine is unavailable. Check the ffmpeg-static installation.',
    ERR_VIDEO_TOO_LARGE: 'Choose a video up to 64 MB.', ERR_REQUEST_TOO_LARGE: 'Choose a video up to 64 MB.',
    ERR_VIDEO_FORMAT: 'Only MP4 and WebM video are supported.', ERR_VIDEO_OUTPUT_LIMIT: 'Output exceeded 64 MB. Reduce duration or resolution.',
};
export function VideoWorkspace({ onSaved, assets = [] }: Props) {
    const [file, setFile] = useState<File | null>(null), [assetUrl, setAssetUrl] = useState('');
    const [preview, setPreview] = useState(''), [duration, setDuration] = useState(0);
    const [settings, setSettings] = useState<VideoRenderSettings>(defaults);
    const [busy, setBusy] = useState(false), [message, setMessage] = useState('Choose a video to start a local edit.');
    const [result, setResult] = useState<CreativeAsset | null>(null);
    useEffect(() => () => { if (preview.startsWith('blob:')) URL.revokeObjectURL(preview); }, [preview]);
    function chooseFile(next?: File) {
        if (!next) return;
        if (!['video/mp4', 'video/webm'].includes(next.type) || next.size > 64 * 1024 * 1024) { setMessage('Choose MP4 or WebM up to 64 MB.'); return; }
        setPreview(URL.createObjectURL(next)); setFile(next); setAssetUrl(''); setResult(null); setDuration(0); setSettings(defaults); setMessage('Clip loaded. Set trim and framing before exporting.');
    }
    function chooseAsset(url: string) {
        setAssetUrl(url); setFile(null); setPreview(url); setResult(null); setDuration(0); setSettings(defaults);
    }
    async function render() {
        if (busy || (!file && !assetUrl)) return;
        setBusy(true); setMessage('Rendering locally. Keep this window open until the export completes.');
        try {
            const form = new FormData(); if (file) form.set('file', file); else form.set('assetUrl', assetUrl);
            form.set('settings', JSON.stringify(settings));
            const response = await fetch('/api/creative/video-render', { method: 'POST', body: form });
            const payload = await response.json();
            if (!response.ok) throw new Error(errors[payload.error] ?? 'Could not export this video. Check the input and local server.');
            setResult(payload.asset); onSaved?.(payload.asset); setMessage('MP4 exported and saved to your asset library.');
        } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
    }
    return <section className="image-workspace video-workspace" aria-label="Local video editing workspace">
        <div className="iw-heading"><div><span className="eyebrow">LOCAL VIDEO WORKSPACE</span><h2>Shape the final frame.</h2><p>Trim, reframe, resize and adjust audio locally. Freeze extension holds the last frame; it does not create new motion.</p></div></div>
        <div className="vw-layout"><aside className="iw-panel"><h3>Source video</h3>
            <label className="iw-file">Upload MP4 / WebM<input type="file" accept="video/mp4,video/webm" disabled={busy} onChange={event => { chooseFile(event.target.files?.[0]); event.target.value = ''; }} /></label>
            {assets.some(asset => asset.mimeType.startsWith('video/')) && <label>Or choose library video<select aria-label="Video source asset" disabled={busy} value={assetUrl} onChange={event => chooseAsset(event.target.value)}><option value="">Choose a video</option>{assets.filter(asset => ['video/mp4', 'video/webm'].includes(asset.mimeType)).map(asset => <option key={asset.id} value={asset.url}>{asset.name}</option>)}</select></label>}
            <p className="iw-help">Up to 64 MB per source. Maximum 60 seconds per trim plus 15 seconds freeze tail. MP4 export uses H.264/AAC.</p>
            <h3>Trim</h3><div className="iw-pair"><label>Start (seconds)<input aria-label="Video trim start" type="number" step="0.1" min="0" max="600" disabled={busy} value={settings.start} onChange={event => setSettings(current => ({ ...current, start: Number(event.target.value) }))} /></label>
                <label>End (seconds)<input aria-label="Video trim end" type="number" step="0.1" min="0.05" max={duration || 660} disabled={busy} value={settings.end} onChange={event => setSettings(current => ({ ...current, end: Number(event.target.value) }))} /></label></div>
            <h3>Framing & resolution</h3><label>Aspect ratio<select aria-label="Video output aspect ratio" disabled={busy} value={settings.ratio} onChange={event => setSettings(current => ({ ...current, ratio: event.target.value as VideoRenderSettings['ratio'] }))}><option value="source">Keep source ratio</option><option value="16:9">Landscape 16:9</option><option value="9:16">Portrait 9:16</option><option value="1:1">Square 1:1</option></select></label>
            <label>Fit<select aria-label="Video reframing fit" disabled={busy} value={settings.fit} onChange={event => setSettings(current => ({ ...current, fit: event.target.value as VideoRenderSettings['fit'] }))}><option value="contain">Fit whole frame with padding</option><option value="cover">Center crop to fill</option></select></label>
            <label>Output height<select aria-label="Video output resolution" disabled={busy} value={settings.height} onChange={event => setSettings(current => ({ ...current, height: Number(event.target.value) as VideoRenderSettings['height'] }))}>{[360, 480, 720, 1080].map(height => <option key={height} value={height}>{height}p</option>)}</select></label>
            <p className="iw-help">Local resize interpolates pixels. AI upscale and prompt-based video edits use separate AI workflows.</p>
            <h3>Tail & audio</h3><label>Freeze last frame (seconds)<input aria-label="Freeze extension seconds" type="number" min="0" max="15" step="0.5" disabled={busy} value={settings.freeze} onChange={event => setSettings(current => ({ ...current, freeze: Number(event.target.value) }))} /></label>
            <label>Audio volume {Math.round(settings.volume * 100)}%<input aria-label="Video audio volume" type="range" min="0" max="2" step="0.05" disabled={busy} value={settings.volume} onChange={event => setSettings(current => ({ ...current, volume: Number(event.target.value) }))} /></label>
            <button disabled={busy || (!file && !assetUrl)} onClick={() => void render()}>{busy ? 'Exporting…' : 'Render & save MP4'}</button>
        </aside><div><div className="vw-preview">{preview ? <video key={preview} controls preload="metadata" src={preview} onLoadedMetadata={event => {
            const seconds = event.currentTarget.duration;
            if (Number.isFinite(seconds)) { setDuration(seconds); setSettings(current => ({ ...current, end: Math.max(0.05, Math.min(60, seconds)) })); }
        }} /> : <p className="iw-help">Your source video preview appears here.</p>}</div>
            <p className="iw-status" role="status">{message}</p>
            {!!duration && <p className="iw-help">Source duration: {duration.toFixed(2)} seconds. Preview shows the original; output appears after rendering.</p>}
            {result && <div className="vw-result"><h3>Exported result</h3><video controls src={result.url} preload="metadata" /><a href={result.url} download={result.name}>Download edited MP4</a></div>}
        </div></div>
    </section>;
}
