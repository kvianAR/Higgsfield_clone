import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import path from 'node:path';
import { CREATIVE_DIRECTORY, creativeWorkspace, creativeId, creativeFailure, CreativeWorkspaceError } from '@/lib/creative/workspace';
import { guardWorkspaceRequest, applyWorkspaceHeaders } from '@/lib/workspace-access';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
    const denial = guardWorkspaceRequest(request); if (denial) return denial;
    let handle;
    try {
        const id = creativeId((await context.params).id); const asset = (await creativeWorkspace.read()).assets.find(item => item.id === id);
        if (!asset) throw new CreativeWorkspaceError('ERR_CREATIVE_ASSET_NOT_FOUND', 404);
        handle = await open(path.join(CREATIVE_DIRECTORY, 'media', id), constants.O_RDONLY | constants.O_NOFOLLOW);
        const data = await handle.readFile();
        return applyWorkspaceHeaders(new Response(data, { headers: { 'Content-Type': asset.mimeType, 'Content-Length': String(data.length), 'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(asset.name)}` } }));
    } catch (error) { return applyWorkspaceHeaders(creativeFailure(error)); } finally { await handle?.close(); }
}
