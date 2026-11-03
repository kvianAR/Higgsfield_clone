'use client';
import { useEffect, useState } from 'react';
type Record = { status?: string; prompt?: string; input?: unknown; params?: unknown; result_urls?: string[]; video_urls?: string[]; outputs?: { url: string }[] };
export function ProjectGeneration({ taskId, jobId }: { taskId?: string; jobId?: string }) {
    const [record, setRecord] = useState<Record | null>(null);
    const [error, setError] = useState('');
    useEffect(() => {
        let active = true;
        if (!taskId && !jobId) return;
        const load = async () => {
            const urls = jobId ? ['/api/creative/jobs?id=' + encodeURIComponent(jobId)] : ['/api/tasks/' + encodeURIComponent(taskId!), '/api/image-tasks/' + encodeURIComponent(taskId!)];
            for (const url of urls) {
                const response = await fetch(url);
                if (response.ok) { if (active) setRecord(await response.json()); return; }
            }
            if (active) setError('Linked generation is unavailable.');
        };
        void load().catch(() => { if (active) setError('Could not load linked generation.'); });
        return () => { active = false; };
    }, [taskId, jobId]);
    const outputs = record?.outputs?.map(output => output.url) ?? record?.result_urls ?? record?.video_urls ?? [];
    return <div><small>Linked generation {jobId ?? taskId} · {record?.status}</small>{outputs.map((url, index) => <a style={{ display: 'block' }} href={url} target="_blank" rel="noopener noreferrer" key={url}>Open result {index + 1}</a>)}{record && <details><summary>Original generation settings</summary><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{JSON.stringify(record.input ?? record.params, null, 2)}</pre></details>}{error && <p role="status">{error}</p>}</div>;
}
