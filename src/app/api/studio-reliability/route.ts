import { guardWorkspaceRequest, applyWorkspaceHeaders } from '@/lib/workspace-access';
import { readBoundedJson, requestFailure } from '@/lib/request-limits';
import { checkProvider, providerHealth, priceQuote, saveRate } from '@/lib/studio-reliability';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
    const denial = guardWorkspaceRequest(request); if (denial) return denial;
    return applyWorkspaceHeaders(Response.json({ providers: await providerHealth() }));
}
export async function POST(request: Request) {
    const denial = guardWorkspaceRequest(request); if (denial) return denial;
    try {
        const input = await readBoundedJson(request, 32000) as Record<string, unknown>;
        if (!input || typeof input !== 'object') throw new Error('ERR_INPUT');
        const data = input.action === 'check' ? { providers: await checkProvider(String(input.provider)) } : input.action === 'rate' ? await saveRate(input) : input.action === 'quote' && typeof input.workflowId === 'string' && input.input && typeof input.input === 'object' && !Array.isArray(input.input) ? await priceQuote(input.workflowId, input.input as Record<string, unknown>) : null;
        if (!data) throw new Error('ERR_INPUT');
        return applyWorkspaceHeaders(Response.json(data));
    } catch (error) { return requestFailure(error); }
}
