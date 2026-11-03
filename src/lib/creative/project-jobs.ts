import { createHash } from 'node:crypto';
import { creativeWorkspace } from './workspace';

export async function linkProjectJob(job: { id: string; workflowId: string; projectId?: string; input: Record<string, unknown>; outputs: { url: string }[]; status: string }) {
    if (!job.projectId) return;
    const id = 'job-' + createHash('sha256').update(job.projectId + job.id).digest('hex').slice(0, 60);
    for (let attempt = 0; attempt < 3; attempt++) {
        const state = await creativeWorkspace.read();
        if (!state.projects.some(project => project.id === job.projectId)) return;
        const existing = state.shots.find(shot => shot.id === id);
        const references = JSON.stringify(job.input);
        const assetIds = state.assets.filter(asset => references.includes(asset.url) || job.outputs.some(output => output.url === asset.url)).map(asset => asset.id);
        if (existing?.status === job.status && JSON.stringify(existing.assetIds) === JSON.stringify([...new Set([...(existing.assetIds ?? []), ...assetIds])].slice(0,50))) return;
        try {
            await creativeWorkspace.mutate({ action: 'put', kind: 'shots', expectedRevision: state.revision, record: {
                ...existing, id, projectId: job.projectId, jobId: job.id, title: existing?.title ?? job.workflowId.slice(0,160), prompt: String(job.input.prompt ?? job.input.text ?? existing?.prompt ?? job.workflowId).slice(0,12000),
                duration: Number(job.input.duration) || existing?.duration || 5, order: existing?.order ?? state.shots.filter(shot => shot.projectId === job.projectId).length,
                elementIds: existing?.elementIds ?? [], assetIds: [...new Set([...(existing?.assetIds ?? []), ...assetIds])].slice(0,50), status: job.status,
            } });
            return;
        } catch (error) { if ((error as { code?: string }).code !== 'ERR_CREATIVE_CONFLICT' || attempt === 2) throw error; }
    }
}
