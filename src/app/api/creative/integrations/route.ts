import { guardWorkspaceRequest, applyWorkspaceHeaders } from '@/lib/workspace-access';
export const runtime = 'nodejs';
export async function GET(request: Request) {
    const denial = guardWorkspaceRequest(request); if (denial) return denial;
    return applyWorkspaceHeaders(Response.json({
        cli: { entry: 'integrations/cinqra.mjs', commands: ['workspace', 'assets', 'upload <file>', 'export <project-id>', 'director <brief>', 'jobs', 'job <id>', 'generate <workflow-id> <input-json>'] },
        mcp: { entry: 'integrations/mcp-server.mjs', transport: 'stdio', protocolVersion: '2024-11-05', tools: ['cinqra_workspace', 'cinqra_assets', 'cinqra_director', 'cinqra_jobs', 'cinqra_generate'] },
        adobe: { host: 'Photoshop', entry: 'integrations/adobe-uxp/manifest.json', status: 'source-ready-host-unverified', installation: 'Load manifest.json in Adobe UXP Developer Tool. Photoshop 25+ required.' },
        adobeHandoff: { afterEffects: 'integrations/adobe-handoff/after-effects-import.jsx', premierePro: 'integrations/adobe-handoff/premiere-import.jsx', status: 'source-ready-host-unverified', mode: 'Import downloaded files through each editor scripting host; not a live generation plugin.' },
        handoff: 'Export project JSON from the CLI; download media assets for import into your editing app. No automatic host launch.'
    }));
}
