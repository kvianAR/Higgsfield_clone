import { creativeWorkspace, creativeFailure } from '@/lib/creative/workspace';
import { guardWorkspaceRequest, applyWorkspaceHeaders } from '@/lib/workspace-access';
import { readBoundedJson, RequestLimitError, requestFailure } from '@/lib/request-limits';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
    const denial = guardWorkspaceRequest(request); if (denial) return denial;
    try { return applyWorkspaceHeaders(Response.json(await creativeWorkspace.read())); } catch (error) { return applyWorkspaceHeaders(creativeFailure(error)); }
}
export async function POST(request: Request) {
    const denial = guardWorkspaceRequest(request); if (denial) return denial;
    try { return applyWorkspaceHeaders(Response.json(await creativeWorkspace.mutate(await readBoundedJson(request, 200_000)))); }
    catch (error) { return error instanceof RequestLimitError ? requestFailure(error) : applyWorkspaceHeaders(creativeFailure(error)); }
}
