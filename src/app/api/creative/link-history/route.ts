import { guardWorkspaceRequest, applyWorkspaceHeaders } from '@/lib/workspace-access';
import { readBoundedJson, requestFailure } from '@/lib/request-limits';
import { getPublicTask } from '@/lib/task-store';
import { creativeWorkspace } from '@/lib/creative/workspace';
export const runtime = 'nodejs';
export async function POST(request: Request) {
    const denial = guardWorkspaceRequest(request); if (denial) return denial;
    try {
        const input = await readBoundedJson(request, 2048) as { projectId: string; taskId: string };
        const task = await getPublicTask(input.taskId);
        if (!task) return Response.json({ error: 'ERR_TASK_NOT_FOUND' }, { status: 404 });
        for (let attempt = 0; attempt < 3; attempt++) {
            const state = await creativeWorkspace.read();
            if (!state.projects.some(project => project.id === input.projectId)) throw new Error('ERR_PROJECT_NOT_FOUND');
            const id = `history-${input.taskId}-${input.projectId}`.slice(0, 100);
            const existing = state.shots.find(shot => shot.id === id);
            try {
                const result = await creativeWorkspace.mutate({ action: 'put', kind: 'shots', expectedRevision: state.revision, record: {
                    ...existing, id, projectId: input.projectId, title: existing?.title ?? `${task.media_type} · ${task.model_id}`.slice(0, 160),
                    prompt: task.prompt || 'Generation', duration: Number(task.params?.duration) || 5, order: existing?.order ?? state.shots.filter(shot => shot.projectId === input.projectId).length,
                    elementIds: existing?.elementIds ?? [], assetIds: existing?.assetIds ?? [], status: task.status, sourceTaskId: task.task_id,
                } });
                return applyWorkspaceHeaders(Response.json(result));
            } catch (error) { if ((error as { code?: string }).code !== 'ERR_CREATIVE_CONFLICT' || attempt === 2) throw error; }
        }
        throw new Error('ERR_PROJECT_CONFLICT');
    } catch (error) { return requestFailure(error); }
}
