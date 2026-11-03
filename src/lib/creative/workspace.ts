import { constants } from 'node:fs';
import { mkdir, open, readFile, rename, rm, stat, lstat } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { STORAGE_ROOT } from '@/lib/storage-paths';
import { detectMediaMime } from '@/lib/media-transfer';
import type { CreativeAsset, CreativeWorkspace, WorkspaceKind } from './workspace-types';

export class CreativeWorkspaceError extends Error { constructor(public code: string, public status = 400) { super(code); } }
const kinds = ['projects', 'elements', 'shots', 'posts'] as const;
const empty = (): CreativeWorkspace => ({ revision: 0, projects: [], elements: [], shots: [], posts: [], assets: [] });
const idPattern = /^[a-zA-Z0-9_-]{1,100}$/;
export function creativeId(value: unknown): string { if (typeof value !== 'string' || !idPattern.test(value)) throw new CreativeWorkspaceError('ERR_CREATIVE_ID'); return value; }
function text(value: unknown, max: number, required = false): string { if (value === undefined && !required) return ''; if (typeof value !== 'string' || value.length > max || (required && !value.trim())) throw new CreativeWorkspaceError('ERR_CREATIVE_FIELD'); return value.trim(); }
function object(value: unknown): Record<string, unknown> { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new CreativeWorkspaceError('ERR_CREATIVE_INPUT'); return value as Record<string, unknown>; }
function ids(value: unknown, known: { id: string }[]): string[] { if (value === undefined) return []; if (!Array.isArray(value) || value.length > 50) throw new CreativeWorkspaceError('ERR_CREATIVE_REFERENCES'); const result = [...new Set(value.map(creativeId))]; if (result.some(id => !known.some(item => item.id === id))) throw new CreativeWorkspaceError('ERR_CREATIVE_REFERENCE_MISSING'); return result; }
function number(value: unknown, min: number, max: number) { if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new CreativeWorkspaceError('ERR_CREATIVE_NUMBER'); return value; }

export function applyWorkspaceMutation(state: CreativeWorkspace, raw: unknown): CreativeWorkspace {
    const input = object(raw);
    if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision !== state.revision) throw new CreativeWorkspaceError('ERR_CREATIVE_CONFLICT', 409);
    if (!kinds.includes(input.kind as WorkspaceKind)) throw new CreativeWorkspaceError('ERR_CREATIVE_KIND');
    const kind = input.kind as WorkspaceKind;
    const next = structuredClone(state);
    const collection = next[kind] as { id: string }[];
    const now = new Date().toISOString();
    if (input.action === 'put') {
        const record = object(input.record); const id = record.id === undefined ? randomUUID() : creativeId(record.id);
        const existing = collection.find(item => item.id === id) as Record<string, unknown> | undefined;
        let saved: Record<string, unknown>;
        if (kind === 'projects') {
            if (record.canvas !== undefined && JSON.stringify(record.canvas).length > 150_000) throw new CreativeWorkspaceError('ERR_CREATIVE_CANVAS_LIMIT');
            saved = { id, name: text(record.name, 160, true), brief: text(record.brief, 12_000), ...(record.canvas === undefined ? {} : { canvas: record.canvas }), createdAt: existing?.createdAt ?? now, updatedAt: now };
        } else if (kind === 'elements') {
            if (!['character', 'location', 'prop', 'product'].includes(record.kind as string)) throw new CreativeWorkspaceError('ERR_CREATIVE_ELEMENT_KIND');
            saved = { id, name: text(record.name, 160, true), kind: record.kind, description: text(record.description, 8_000), assetIds: ids(record.assetIds, next.assets), createdAt: existing?.createdAt ?? now };
        } else if (kind === 'shots') {
            const projectId = creativeId(record.projectId); if (!next.projects.some(p => p.id === projectId)) throw new CreativeWorkspaceError('ERR_CREATIVE_REFERENCE_MISSING');
            saved = { id, projectId, title: text(record.title, 160, true), prompt: text(record.prompt, 12_000), duration: number(record.duration ?? 5, 1, 600), order: number(record.order ?? 0, 0, 100_000), elementIds: ids(record.elementIds, next.elements), assetIds: ids(record.assetIds, next.assets), ...(record.status === undefined ? {} : { status: text(record.status, 50) }), ...(record.sourceTaskId ? { sourceTaskId: creativeId(record.sourceTaskId) } : {}), ...(record.jobId ? { jobId: creativeId(record.jobId) } : {}) };
        } else {
            saved = { id, title: text(record.title, 160, true), prompt: text(record.prompt, 12_000, true), assetIds: ids(record.assetIds, next.assets), author: text(record.author, 100, true), likes: existing?.likes ?? 0, createdAt: existing?.createdAt ?? now, ...(existing?.sourceId ? { sourceId: existing.sourceId } : {}) };
        }
        const index = collection.findIndex(item => item.id === id);
        if (index < 0) { if (collection.length >= 5_000) throw new CreativeWorkspaceError('ERR_CREATIVE_CAPACITY', 413); collection.push(saved as { id: string }); } else collection[index] = saved as { id: string };
    } else if (input.action === 'remove') {
        const id = creativeId(input.id); const index = collection.findIndex(item => item.id === id);
        if (index < 0) throw new CreativeWorkspaceError('ERR_CREATIVE_NOT_FOUND', 404);
        collection.splice(index, 1);
        if (kind === 'projects') next.shots = next.shots.filter(shot => shot.projectId !== id);
        if (kind === 'elements') next.shots = next.shots.map(shot => ({ ...shot, elementIds: shot.elementIds.filter(element => element !== id) }));
    } else if ((input.action === 'like' || input.action === 'remix') && kind === 'posts') {
        const post = next.posts.find(item => item.id === creativeId(input.id)); if (!post) throw new CreativeWorkspaceError('ERR_CREATIVE_NOT_FOUND', 404);
        if (input.action === 'like') post.likes = Math.min(post.likes + 1, 1_000_000);
        else { if (next.posts.length >= 5_000) throw new CreativeWorkspaceError('ERR_CREATIVE_CAPACITY', 413); const author = input.author ?? (input.record && typeof input.record === 'object' ? (input.record as Record<string, unknown>).author : undefined) ?? 'Local creator'; next.posts.push({ ...post, id: randomUUID(), title: `Remix: ${post.title}`.slice(0,160), author: text(author, 100, true), sourceId: post.id, likes: 0, createdAt: now }); }
    } else throw new CreativeWorkspaceError('ERR_CREATIVE_ACTION');
    next.revision++;
    return next;
}

export function createCreativeWorkspaceStore(directory: string) {
    const filename = path.join(directory, 'workspace.json'); const lock = path.join(directory, 'workspace.lock');
    async function prepare() { await mkdir(directory, { recursive: true, mode: 0o700 }); if ((await lstat(directory)).isSymbolicLink()) throw new CreativeWorkspaceError('ERR_CREATIVE_STORAGE', 503); }
    async function read(): Promise<CreativeWorkspace> {
        await prepare();
        let handle;
        try {
            handle = await open(filename, constants.O_RDONLY | constants.O_NOFOLLOW);
            if ((await handle.stat()).size > 20 * 1024 * 1024) throw new Error('too large');
            const value = JSON.parse(await handle.readFile('utf8')) as CreativeWorkspace;
            if (!Number.isSafeInteger(value.revision) || ![...kinds, 'assets'].every(kind => Array.isArray(value[kind]))) throw new Error('invalid state');
            return value;
        } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return empty(); throw new CreativeWorkspaceError('ERR_CREATIVE_STORAGE', 503); }
        finally { await handle?.close(); }
    }
    async function exclusive<T>(work: () => Promise<T>): Promise<T> {
        await prepare(); const deadline = Date.now() + 3000;
        for (;;) {
            try { await mkdir(lock, { mode: 0o700 }); break; }
            catch (error) {
                if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw new CreativeWorkspaceError('ERR_CREATIVE_STORAGE', 503);
                // Recover a stale lock only when its recorded owner process no longer exists.
                try { const owner = JSON.parse(await readFile(path.join(lock, 'owner.json'), 'utf8')); if (Date.now() - (await stat(lock)).mtimeMs > 120_000) { try { process.kill(owner.pid, 0); } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ESRCH') await rm(lock, { recursive: true }); } } } catch { /* A concurrent writer may still be creating the lock metadata. */ }
                if (Date.now() > deadline) throw new CreativeWorkspaceError('ERR_CREATIVE_BUSY', 503);
                await new Promise(resolve => setTimeout(resolve, 20));
            }
        }
        let owner;
        try { owner = await open(path.join(lock, 'owner.json'), 'wx', 0o600); await owner.writeFile(JSON.stringify({ pid: process.pid })); await owner.close(); return await work(); }
        finally { await owner?.close().catch(() => {}); await rm(lock, { recursive: true, force: true }); }
    }
    async function write(state: CreativeWorkspace) {
        const temporary = path.join(directory, `${randomUUID()}.tmp`); const handle = await open(temporary, 'wx', 0o600);
        try { await handle.writeFile(JSON.stringify(state)); await handle.sync(); await handle.close(); await rename(temporary, filename); }
        finally { await handle.close().catch(() => {}); await rm(temporary, { force: true }); }
    }
    return { read, mutate: (input: unknown) => exclusive(async () => { const next = applyWorkspaceMutation(await read(), input); await write(next); return next; }),
        addAsset: (asset: CreativeAsset) => exclusive(async () => { const state = await read(); if (state.assets.length >= 5_000) throw new CreativeWorkspaceError('ERR_CREATIVE_CAPACITY', 413); state.assets.push(asset); state.revision++; await write(state); return asset; }) };
}
export const CREATIVE_DIRECTORY = path.join(STORAGE_ROOT, '.cinqra-creative');
export const creativeWorkspace = createCreativeWorkspaceStore(CREATIVE_DIRECTORY);
export async function saveCreativeAsset(bytes: Uint8Array, name: string, declaredMimeType?: string): Promise<CreativeAsset> {
    let mimeType: string;
    try { mimeType = detectMediaMime(bytes, declaredMimeType); } catch { throw new CreativeWorkspaceError('ERR_UNSUPPORTED_MEDIA_TYPE', 415); }
    if (!bytes.byteLength || bytes.byteLength > (mimeType.startsWith('image/') ? 20 : 64) * 1024 * 1024) throw new CreativeWorkspaceError('ERR_CREATIVE_ASSET_TOO_LARGE', 413);
    const id = randomUUID(); const directory = path.join(CREATIVE_DIRECTORY, 'media');
    await mkdir(directory, { recursive: true, mode: 0o700 }); if ((await lstat(directory)).isSymbolicLink()) throw new CreativeWorkspaceError('ERR_CREATIVE_STORAGE', 503);
    const filename = path.join(directory, id); const handle = await open(filename, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    try {
        try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
        return await creativeWorkspace.addAsset({ id, name: name.replace(/[\x00-\x1f/\\]/g, '_').slice(0,180) || 'Untitled media', url: `/api/creative/assets/${id}`, mimeType, size: bytes.byteLength, createdAt: new Date().toISOString() });
    } catch (error) { await rm(filename, { force: true }); throw error; }
}
export async function readCreativeAsset(value: string): Promise<{ data: Buffer; mimeType: string }> {
    const origin = process.env.APP_ORIGIN || 'http://127.0.0.1:3017';
    let url: URL;
    try { url = new URL(value, origin); } catch { throw new CreativeWorkspaceError('ERR_CREATIVE_ASSET_URL'); }
    const match = /^\/api\/creative\/assets\/([A-Za-z0-9_-]{1,100})$/.exec(url.pathname);
    if (url.origin !== origin || url.username || url.password || url.search || url.hash || !match) throw new CreativeWorkspaceError('ERR_CREATIVE_ASSET_URL');
    const asset = (await creativeWorkspace.read()).assets.find(item => item.id === match[1]);
    if (!asset) throw new CreativeWorkspaceError('ERR_CREATIVE_ASSET_NOT_FOUND', 404);
    const handle = await open(path.join(CREATIVE_DIRECTORY, 'media', asset.id), constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
        const size = (await handle.stat()).size; if (size !== asset.size || size > 64 * 1024 * 1024) throw new CreativeWorkspaceError('ERR_CREATIVE_STORAGE', 503);
        const data = await handle.readFile(); const mimeType = detectMediaMime(data, asset.mimeType); return { data, mimeType };
    } finally { await handle.close(); }
}
export function creativeFailure(error: unknown): Response { return Response.json({ error: error instanceof CreativeWorkspaceError ? error.code : 'ERR_CREATIVE_STORAGE' }, { status: error instanceof CreativeWorkspaceError ? error.status : 503, headers: { 'Cache-Control': 'private, no-store' } }); }
