export function configuration(env = process.env) {
    const base = new URL(env.CINQRA_URL || 'http://127.0.0.1:3017');
    if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash || base.pathname !== '/') throw new Error('CINQRA_URL must be an origin without credentials or a path');
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname) && base.protocol !== 'https:') throw new Error('Remote CINQRA_URL requires HTTPS');
    const username = env.CINQRA_ACCESS_USER; const password = env.CINQRA_ACCESS_PASSWORD;
    if (Boolean(username) !== Boolean(password)) throw new Error('Set both CINQRA_ACCESS_USER and CINQRA_ACCESS_PASSWORD');
    return { base, authorization: username ? `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}` : undefined };
}
export async function request(endpoint, options = {}, env = process.env) {
    if (!endpoint.startsWith('/api/creative/') || endpoint.includes('..')) throw new Error('Unsupported CINQRA endpoint');
    const { base, authorization } = configuration(env);
    const response = await fetch(new URL(endpoint, base), { ...options, signal: AbortSignal.timeout(120_000), redirect: 'error', headers: { Origin: base.origin, ...(authorization ? { Authorization: authorization } : {}), ...(options.body && !(options.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}), ...options.headers } });
    const raw = await response.text(); if (raw.length > 25 * 1024 * 1024) throw new Error('CINQRA response too large');
    let result; try { result = JSON.parse(raw); } catch { throw new Error(`CINQRA returned HTTP ${response.status}`); }
    if (!response.ok) throw new Error(`CINQRA ${response.status}: ${result.error || 'request failed'}`);
    return result;
}
export function projectExport(workspace, id, base) {
    const project = workspace.projects.find(project => project.id === id); if (!project) throw new Error('Project not found');
    const shots = workspace.shots.filter(shot => shot.projectId === id).sort((a,b) => a.order-b.order);
    const elements = workspace.elements.filter(element => shots.some(shot => shot.elementIds.includes(element.id)));
    const assetIds = new Set([...shots.flatMap(shot => shot.assetIds), ...elements.flatMap(element => element.assetIds)]);
    return { format: 'cinqra-project', version: 1, exportedAt: new Date().toISOString(), project, shots, elements, assets: workspace.assets.filter(asset => assetIds.has(asset.id)).map(asset => ({ ...asset, url: new URL(asset.url, base).href })), note: 'Asset links require access to this CINQRA workspace. Download files separately for offline editing.' };
}
