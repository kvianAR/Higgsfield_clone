'use client';
import { useEffect, useState } from 'react';
import type { AnyTask } from '@/types';

export function HistoryWorkbench({ mode }: { mode: 'image' | 'video' }) {
    const [tasks, setTasks] = useState<AnyTask[]>([]);
    const [cursor, setCursor] = useState<string | null>(null);
    const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
    const [projectId, setProjectId] = useState('');
    const [message, setMessage] = useState('');
    const endpoint = mode === 'image' ? '/api/image-tasks' : '/api/tasks';
    async function load(next?: string) {
        const response = await fetch(endpoint + '?limit=20' + (next ? '&cursor=' + encodeURIComponent(next) : ''));
        if (!response.ok) throw new Error('Could not load generation history.');
        const page = await response.json();
        const records = Array.isArray(page) ? page : page.tasks;
        setTasks(current => next ? [...current, ...records.filter((task: AnyTask) => !current.some(item => item.task_id === task.task_id))] : records);
        setCursor(page.nextCursor ?? null);
    }
    useEffect(() => {
        let active = true;
        const timer = setTimeout(() => {
            void load().catch(error => { if (active) setMessage(error.message); });
            void fetch('/api/creative/workspace').then(response => response.json()).then(data => { if (active) setProjects(data.projects ?? []); });
        }, 0);
        return () => { active = false; clearTimeout(timer); };
    // Loading resets the selected media page whenever its endpoint changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [endpoint]);
    function reuse(task: AnyTask, action: 'reuse' | 'variation' | 'video') {
        sessionStorage.setItem('cinqra-reuse', JSON.stringify({ task, action }));
        window.dispatchEvent(new CustomEvent('cinqra:reuse', { detail: { prompt: task.prompt ?? '', mode: action === 'video' ? 'video' : task.media_type } }));
    }
    return <details style={{ padding: 18, marginBottom: 20, border: '1px solid #b59bd533', borderRadius: 12 }}><summary>History actions · reuse, variations and project links</summary><p>Review restored settings and inputs before submitting a new paid request.</p><button onClick={() => void load().catch(error => setMessage(error.message))}>Refresh history</button><select aria-label="Save history to project" value={projectId} onChange={event => setProjectId(event.target.value)}><option value="">Choose project</option>{projects.map(project => <option value={project.id} key={project.id}>{project.name}</option>)}</select>{tasks.map(task => <article key={task.task_id} style={{ padding: 12, borderBottom: '1px solid #ffffff18' }}><strong>{task.model_id}</strong><p>{task.prompt}</p><small>{task.status} · {new Date(task.created_at).toLocaleString()}</small><div><button onClick={() => reuse(task, 'reuse')}>Reuse settings</button><button onClick={() => reuse(task, 'variation')}>Prepare variation</button>{mode === 'image' && (task.status === 'COMPLETED') && <button onClick={() => reuse(task, 'video')}>Animate this image</button>}{['FAILED','ERROR','CANCELLED'].includes(task.status ?? '') && <button onClick={() => reuse(task, 'reuse')}>Review retry</button>}<button disabled={!projectId} onClick={async () => { try { const response = await fetch('/api/creative/link-history', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, taskId: task.task_id }) }); if (!response.ok) throw new Error('Could not link this task. Refresh projects and try again.'); setMessage('Task linked to the project with its prompt, settings and result references.'); } catch (error) { setMessage((error as Error).message); } }}>Save to project</button></div></article>)}{cursor && <button onClick={() => void load(cursor).catch(error => setMessage(error.message))}>Load more history</button>}<p role="status">{message}</p></details>;
}
