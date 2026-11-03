import { applyWorkspaceHeaders, guardWorkspaceRequest, accessFailure } from "@/lib/workspace-access";
import { readBoundedJson, requestFailure } from "@/lib/request-limits";
import { canEditConnections, connectionState, saveConnection, validateConnection } from "@/lib/connections.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
    const denial = guardWorkspaceRequest(request);
    if (denial) return denial;
    return applyWorkspaceHeaders(Response.json({
        ...connectionState(),
        editable: canEditConnections(request.url),
        verification: "configuration-presence-only",
    }));
}

export async function POST(request: Request) {
    const denial = guardWorkspaceRequest(request);
    if (denial) return denial;
    if (!canEditConnections(request.url)) return accessFailure("ERR_LOCAL_SETTINGS_ONLY", 403);
    let input: unknown;
    try { input = await readBoundedJson(request, 2048); }
    catch (error) { return requestFailure(error); }
    try { validateConnection(input); }
    catch { return accessFailure("ERR_INVALID_CONNECTION", 400); }
    try {
        const state = await saveConnection(input);
        return applyWorkspaceHeaders(Response.json({ ...state, editable: true, verification: "configuration-presence-only" }));
    } catch { return accessFailure("ERR_CONNECTION_STORAGE", 503); }
}
