import { spawn } from 'node:child_process';
import ffmpegPath from 'ffmpeg-static';
import { mkdtemp, writeFile, readFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { readCreativeAsset, saveCreativeAsset, creativeFailure } from '@/lib/creative/workspace';
import { guardWorkspaceRequest, applyWorkspaceHeaders } from '@/lib/workspace-access';
import { readGenerationForm, RequestLimitError, requestFailure } from '@/lib/request-limits';
import { detectMediaMime } from '@/lib/media-transfer';
import { parseVideoRenderSettings, videoRenderArgs, VideoRenderError } from '@/lib/creative/video-render';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 180;
let active = 0;
async function runFfmpeg(args: string[], signal: AbortSignal) {
    const executable = ffmpegPath;
    if (!executable) throw new VideoRenderError('ERR_FFMPEG_NOT_AVAILABLE', 503);
    await new Promise<void>((resolve, reject) => {
        const child = spawn(executable, args, { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
        let settled = false;
        const finish = (error?: Error) => {
            if (settled) return; settled = true; clearTimeout(timer); signal.removeEventListener('abort', abort);
            if (error) reject(error); else resolve();
        };
        const abort = () => { child.kill('SIGKILL'); finish(new VideoRenderError('ERR_VIDEO_RENDER_CANCELLED', 408)); };
        const timer = setTimeout(() => { child.kill('SIGKILL'); finish(new VideoRenderError('ERR_VIDEO_RENDER_TIMEOUT', 408)); }, 150_000);
        // Decoder errors can include source metadata. Drain output without returning or logging it.
        child.stderr.on('data', () => {});
        child.once('error', () => finish(new VideoRenderError('ERR_FFMPEG_NOT_AVAILABLE', 503)));
        child.once('exit', code => finish(code === 0 ? undefined : new VideoRenderError('ERR_VIDEO_RENDER_FAILED')));
        signal.addEventListener('abort', abort, { once: true }); if (signal.aborted) abort();
    });
}
export async function POST(request: Request) {
    const denial = guardWorkspaceRequest(request); if (denial) return denial;
    if (active >= 1) return applyWorkspaceHeaders(Response.json({ error: 'ERR_VIDEO_RENDER_BUSY' }, { status: 429 }));
    active++; let directory: string | undefined;
    try {
        const form = await readGenerationForm(request, { maxBytes: 64 * 1024 * 1024 + 65536 });
        if ([...form.keys()].some(key => !['file', 'assetUrl', 'settings'].includes(key))) throw new VideoRenderError('ERR_VIDEO_INPUT');
        const settingsText = form.get('settings'); if (typeof settingsText !== 'string') throw new VideoRenderError('ERR_VIDEO_SETTINGS');
        let parsed: unknown; try { parsed = JSON.parse(settingsText); } catch { throw new VideoRenderError('ERR_VIDEO_SETTINGS'); }
        const settings = parseVideoRenderSettings(parsed), file = form.get('file'), assetUrl = form.get('assetUrl');
        let source: { data: Buffer; mimeType: string };
        if (file instanceof File && file.size > 0 && !assetUrl) source = { data: Buffer.from(await file.arrayBuffer()), mimeType: file.type };
        else if (typeof assetUrl === 'string' && !file) source = await readCreativeAsset(assetUrl);
        else throw new VideoRenderError('ERR_VIDEO_INPUT');
        if (source.data.length > 64 * 1024 * 1024) throw new VideoRenderError('ERR_VIDEO_TOO_LARGE', 413);
        const mimeType = detectMediaMime(source.data, source.mimeType);
        if (!['video/mp4', 'video/webm'].includes(mimeType)) throw new VideoRenderError('ERR_VIDEO_FORMAT');
        directory = await mkdtemp(path.join(os.tmpdir(), 'cinqra-video-'));
        const input = path.join(directory, mimeType === 'video/mp4' ? 'input.mp4' : 'input.webm'), output = path.join(directory, 'render.mp4');
        await writeFile(input, source.data, { mode: 0o600 });
        await runFfmpeg(videoRenderArgs(input, output, settings), request.signal);
        const outputStat = await stat(output);
        if (!outputStat.size || outputStat.size >= 64 * 1024 * 1024) throw new VideoRenderError('ERR_VIDEO_OUTPUT_LIMIT', 413);
        const asset = await saveCreativeAsset(await readFile(output), 'cinqra-video-edit.mp4', 'video/mp4');
        return applyWorkspaceHeaders(Response.json({ asset, processing: 'local-ffmpeg', freezeExtension: settings.freeze }, { status: 201 }));
    } catch (error) {
        if (error instanceof VideoRenderError) return applyWorkspaceHeaders(Response.json({ error: error.code }, { status: error.status }));
        return error instanceof RequestLimitError ? requestFailure(error) : applyWorkspaceHeaders(creativeFailure(error));
    } finally { active--; if (directory) await rm(directory, { recursive: true, force: true }); }
}
