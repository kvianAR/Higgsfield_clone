import { creativeWorkspace, creativeFailure, CreativeWorkspaceError, saveCreativeAsset } from '@/lib/creative/workspace';
import { guardWorkspaceRequest, applyWorkspaceHeaders } from '@/lib/workspace-access';
import { readGenerationForm, RequestLimitError, requestFailure } from '@/lib/request-limits';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
    const denial = guardWorkspaceRequest(request); if (denial) return denial;
    try { return applyWorkspaceHeaders(Response.json({ assets: (await creativeWorkspace.read()).assets, maxUploadBytes: 64 * 1024 * 1024, maxImageBytes: 20 * 1024 * 1024 })); }
    catch (error) { return applyWorkspaceHeaders(creativeFailure(error)); }
}
export async function POST(request: Request) {
    const denial = guardWorkspaceRequest(request); if (denial) return denial;
    try {
        const form = await readGenerationForm(request, { maxBytes: 64 * 1024 * 1024 + 65_536 }); const file = form.get('file');
        if (!(file instanceof File) || file.size === 0 || form.getAll('file').length !== 1 || [...form.keys()].some(key => key !== 'file')) throw new CreativeWorkspaceError('ERR_CREATIVE_FILE');
        if (file.size > 64 * 1024 * 1024) throw new CreativeWorkspaceError('ERR_CREATIVE_ASSET_TOO_LARGE', 413);
        const bytes = Buffer.from(await file.arrayBuffer());
        const asset = await saveCreativeAsset(bytes, file.name, file.type);
        return applyWorkspaceHeaders(Response.json(asset, { status: 201 }));
    } catch (error) { return error instanceof RequestLimitError ? requestFailure(error) : applyWorkspaceHeaders(creativeFailure(error)); }
}
