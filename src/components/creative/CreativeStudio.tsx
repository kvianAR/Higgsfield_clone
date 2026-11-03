'use client';
/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Check, Copy, Download, Layers, Loader2, Plus, RefreshCw, Send, Sparkles, Trash2 } from 'lucide-react';
import { ProjectGeneration } from './ProjectGeneration';
import { ProviderHealth, CostPreview } from './Reliability';
import { ImageWorkspace } from './ImageWorkspace';
import { VideoWorkspace } from './VideoWorkspace';
import { continuityBrief, storyBrief, moveShot } from '@/lib/creative/brief';
import './creative.css';

type Panel = 'image' | 'layers' | 'video' | 'elements' | 'characters' | 'director' | 'storyboard' | 'lipsync' | 'audio' | 'marketing' | 'motion' | 'team' | 'community' | 'integrations';
type Asset = { id: string; name: string; url: string; mimeType: string; size: number; createdAt: string };
type Project = { id: string; name: string; brief: string; createdAt: string; updatedAt: string; canvas?: { nodes: CanvasNode[] } };
type Element = { id: string; name: string; kind: 'character' | 'location' | 'prop' | 'product'; description: string; assetIds: string[]; createdAt: string };
type Shot = { id: string; projectId: string; title: string; prompt: string; duration: number; elementIds: string[]; assetIds: string[]; order: number; status?: string; sourceTaskId?: string; jobId?: string };
type Post = { id: string; title: string; prompt: string; assetIds: string[]; author: string; likes: number; sourceId?: string; createdAt: string };
type Workspace = { revision: number; projects: Project[]; elements: Element[]; shots: Shot[]; posts: Post[] };
type Field = { id: string; label: string; type: string; required?: boolean; default?: unknown; options?: unknown[] };
type Workflow = { id: string; label: string; category: string; description: string; available: boolean; reason?: string; provider: string; fields: Field[]; documentation?: string };
type Job = { id: string; workflowId: string; status: string; outputs?: { url: string; mimeType?: string }[]; error?: string; input?: Record<string, unknown>; createdAt: string };
type CanvasNode = { id: string; text: string; x: number; y: number };
const emptyWorkspace: Workspace = { revision: 0, projects: [], elements: [], shots: [], posts: [] };
const panels: { id: Panel; label: string; note: string }[] = [
    { id: 'image', label: 'Image workspace', note: 'Mask, adjust and finish' },
    { id: 'layers', label: 'Layers & text', note: 'Compose editable artwork' },
    { id: 'video', label: 'Video workspace', note: 'Edit, reframe and extend' },
    { id: 'elements', label: 'Elements library', note: 'Characters, places and products' },
    { id: 'characters', label: 'Character continuity', note: 'Reuse your cast across shots' },
    { id: 'director', label: 'AI Director', note: 'Plan before generating' },
    { id: 'storyboard', label: 'Storyboard', note: 'Build a scene shot by shot' },
    { id: 'lipsync', label: 'Lipsync Studio', note: 'Give your character a voice' },
    { id: 'audio', label: 'Audio Studio', note: 'Speech, voices and dubbing' },
    { id: 'marketing', label: 'Marketing Studio', note: 'Your product, new campaigns' },
    { id: 'motion', label: 'Motion transfer', note: 'Recast reference footage' },
    { id: 'team', label: 'Team workspace', note: 'Shared briefs and live canvas' },
    { id: 'community', label: 'Community & remix', note: 'Share in this workspace' },
    { id: 'integrations', label: 'Integrations', note: 'CLI, MCP and Adobe handoff' },
];
async function api<T>(url: string, options?: RequestInit): Promise<T> {
    const response = await fetch(url, { ...options, cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        const messages: Record<string, string> = {
            ERR_CREATIVE_GOOGLE_KEY: 'Connect a Google AI Studio key in API settings, then refresh this workspace.',
            ERR_CREATIVE_GOOGLE_NOT_CONFIGURED: 'Connect a Google AI Studio key in API settings, then refresh this workspace.',
            ERR_CREATIVE_CONFLICT: 'Another client changed this workspace. Refresh and review their changes before saving again.',
            ERR_CREATIVE_REVISION_CONFLICT: 'Another client changed this workspace. Refresh and review their changes before saving again.',
            ERR_CREATIVE_UNAVAILABLE: 'This operation has no enabled provider adapter. Read its availability note before choosing another tool.',
            ERR_REQUEST_TOO_LARGE: 'This upload is too large. Use a reference file below the upload limit.',
        };
        throw new Error(data.message || messages[data.error] || data.error || `Request failed (${response.status})`);
    }
    return data as T;
}
function json(value: unknown): RequestInit { return { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) }; }
function download(name: string, value: unknown) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const newId = () => crypto.randomUUID();

export function CreativeStudio({ onConnect, onGenerate }: { onConnect: () => void; onGenerate: (prompt: string, mode: 'image' | 'video') => void }) {
    const [panel, setPanel] = useState<Panel>('image');
    const [workspace, setWorkspace] = useState<Workspace>(emptyWorkspace);
    const [assets, setAssets] = useState<Asset[]>([]);
    const [workflows, setWorkflows] = useState<Workflow[]>([]);
    const [configured, setConfigured] = useState<Record<string, boolean>>({ higgsfield: false, google: false, freepik: false });
    const [projectId, setProjectId] = useState('');
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [workflowId, setWorkflowId] = useState('');
    const [inputs, setInputs] = useState<Record<string, unknown>>({});
    const [review, setReview] = useState(false);
    const [jobs, setJobs] = useState<Job[]>([]);
    const [author, setAuthor] = useState('Creator');
    const [pendingMedia, setPendingMedia] = useState<{ source?: Asset; mask?: Asset; operation?: string }>({});
    const [directorText, setDirectorText] = useState('');
    const [directorBrief, setDirectorBrief] = useState('');
    const [suggestedShots, setSuggestedShots] = useState<{ title: string; prompt: string; duration: number }[]>([]);
    const [selectedElements, setSelectedElements] = useState<string[]>([]);
    const [continuityPrompt, setContinuityPrompt] = useState('');
    const [campaign, setCampaign] = useState({ product: '', audience: '', format: 'Product shot', brief: '' });
    const requestId = useRef<string | null>(null);
    const project = workspace.projects.find(item => item.id === projectId);
    const projectShots = workspace.shots.filter(shot => shot.projectId === projectId).sort((a, b) => a.order - b.order);
    const chosenElements = workspace.elements.filter(element => selectedElements.includes(element.id));
    const currentWorkflow = workflows.find(item => item.id === workflowId);
    const revisionRef = useRef(0);
    const notify = (text: string) => { setMessage(text); setError(''); };

    const refresh = useCallback(async () => {
        const data = await api<Workspace>('/api/creative/workspace');
        revisionRef.current = data.revision; setWorkspace(data);
        setProjectId(current => data.projects.some(item => item.id === current) ? current : data.projects[0]?.id ?? '');
    }, []);
    const refreshAssets = useCallback(async () => {
        const data = await api<Asset[] | { assets: Asset[] }>('/api/creative/assets');
        setAssets(Array.isArray(data) ? data : data.assets);
    }, []);
    useEffect(() => {
        let active = true;
        const initialLoad = setTimeout(() => { void Promise.all([refresh(), refreshAssets(), api<{ workflows: Workflow[]; configured: Record<string, boolean> }>('/api/creative/workflows').then(data => {
            if (active) { setWorkflows(data.workflows); setConfigured(data.configured); }
        }), api<Job[] | { jobs: Job[] }>('/api/creative/jobs').then(data => { if (active) setJobs(Array.isArray(data) ? data : data.jobs); })]).catch(error => { if (active) setError(error.message); }); }, 0);
        const timer = setInterval(() => { void refresh().catch(error => { if (active) setError(error.message); }); }, 3000);
        return () => { active = false; clearTimeout(initialLoad); clearInterval(timer); };
    }, [refresh, refreshAssets]);
    useEffect(() => {
        const waiting = jobs.filter(job => !['completed', 'failed', 'cancelled', 'error', 'COMPLETED', 'FAILED', 'CANCELLED', 'ERROR', 'submission_unknown', 'recovery_required'].includes(job.status));
        if (!waiting.length) return;
        let active = true;
        const timer = setInterval(() => {
            void Promise.all(waiting.map(job => api<Job>(`/api/creative/jobs?id=${encodeURIComponent(job.id)}`))).then(updated => {
                if (active) setJobs(current => current.map(job => updated.find(item => item.id === job.id) ?? job));
            }).catch(error => { if (active) setError(error.message); });
        }, 4000);
        return () => { active = false; clearInterval(timer); };
    }, [jobs]);

    async function mutate(action: string, kind: string, record?: unknown, id?: string) {
        const data = await api<Workspace>('/api/creative/workspace', json({ action, kind, record, id, ...(action === 'remix' ? { author } : {}), expectedRevision: revisionRef.current }));
        revisionRef.current = data.revision; setWorkspace(data); return data;
    }
    async function perform(task: () => Promise<void>, rethrow = false) {
        setError(''); setMessage(''); setBusy(true);
        try { await task(); } catch (error) { setError(error instanceof Error ? error.message : 'Could not complete this action.'); void refresh().catch(() => {}); if (rethrow) throw error; }
        finally { setBusy(false); }
    }
    async function upload(file: File): Promise<Asset> {
        const form = new FormData(); form.append('file', file);
        const result = await api<Asset>('/api/creative/assets', { method: 'POST', body: form });
        await refreshAssets(); return result;
    }
    function selectWorkflow(item: Workflow) {
        setWorkflowId(item.id); const defaults = Object.fromEntries(item.fields.filter(field => field.default !== undefined).map(field => [field.id, field.default])); const refs = [...new Set(chosenElements.flatMap(element => element.assetIds))].map(id => assets.find(asset => asset.id === id)).filter((asset): asset is Asset => Boolean(asset?.mimeType.startsWith('image/'))).map(asset => asset.url); const brief = panel === 'marketing' ? continuityBrief(`Create a ${campaign.format} for ${campaign.product}. Audience: ${campaign.audience}. ${campaign.brief}`, chosenElements) : panel === 'characters' ? continuityBrief(continuityPrompt, chosenElements) : ''; if (brief) { for (const field of item.fields) { if (field.id === 'prompt') defaults[field.id] = brief; if (field.id === 'target_audience') defaults[field.id] = campaign.audience; if (refs.length && field.type === 'images') defaults[field.id] = refs; if (refs.length && field.type === 'image' && !field.id.includes('mask')) defaults[field.id] = refs[0]; } } setInputs(defaults);
        setReview(false); requestId.current = null;
    }
    async function imageAI(operation: string, source: File, mask?: File) {
        await perform(async () => {
            const image = await upload(source), maskAsset = mask ? await upload(mask) : undefined;
            setPendingMedia({ source: image, mask: maskAsset, operation });
            const matching = workflows.find(item => item.category === 'image' && `${item.id} ${item.label}`.toLowerCase().replaceAll('_', '-').includes(operation)) ?? (!['inpaint', 'layers-decompose', 'background-removal'].includes(operation) ? workflows.find(item => item.available && item.category === 'image' && item.id.includes('image-to-image')) : undefined);
            if (matching) {
                selectWorkflow(matching);
                setInputs(previous => ({ ...previous, prompt: ({ relight: 'Relight the image with natural cinematic lighting while preserving subject identity and composition.', upscale: 'Enhance fine detail and clarity while preserving the source image.', 'text-edit': 'Replace the existing text with: [enter replacement text]. Preserve the surrounding image.', outpaint: 'Extend the image naturally into its transparent canvas regions while preserving the original subject.' } as Record<string, string>)[operation] ?? '', ...Object.fromEntries(matching.fields.filter(field => ['image', 'images'].includes(field.type) && !field.id.includes('mask')).map(field => [field.id, field.type === 'images' ? [image.url] : image.url])), ...Object.fromEntries(matching.fields.filter(field => field.id.includes('mask')).map(field => [field.id, maskAsset?.url ?? ''])) }));
            }
            notify('Source saved to your asset library. Select the documented AI workflow and review its inputs below.');
        });
    }
    async function startJob() {
        if (!currentWorkflow) return;
        await perform(async () => {
            requestId.current ??= newId();
            const job = await api<Job>('/api/creative/jobs', json({ workflowId, input: inputs, clientRequestId: requestId.current, projectId: projectId || undefined }));
            setJobs(current => [job, ...current.filter(item => item.id !== job.id)]); setReview(false);
            notify('Generation submitted. Keep this request in history if its status is uncertain.');
        });
    }
    function mediaPicker(field: Field) {
        const multiple = field.type === 'images';
        const value = multiple ? (Array.isArray(inputs[field.id]) ? (inputs[field.id] as string[]).join('\n') : '') : String(inputs[field.id] ?? '');
        return <><textarea rows={multiple ? 3 : 2} aria-label={field.label} placeholder={multiple ? 'One HTTPS reference URL per line' : 'HTTPS reference URL or an asset from this library'} value={value} onChange={event => { setInputs(current => ({ ...current, [field.id]: multiple ? event.target.value.split('\n').map(value => value.trim()).filter(Boolean) : event.target.value })); setReview(false); requestId.current = null; }} />
            <select aria-label={`Choose library ${field.label}`} value="" onChange={event => {
                if (!event.target.value) return;
                setInputs(current => ({ ...current, [field.id]: multiple ? [...(Array.isArray(current[field.id]) ? current[field.id] as string[] : []), event.target.value] : event.target.value }));
                setReview(false); requestId.current = null;
            }}><option value="">Choose a saved asset…</option>{assets.filter(asset => asset.mimeType.startsWith(field.type === 'images' ? 'image/' : `${field.type}/`)).map(asset => <option value={asset.url} key={asset.id}>{asset.name}</option>)}</select></>;
    }
    function workflowPanel(category: string) {
        const options = workflows.filter(item => item.category === category);
        return <section className="creative-card workflow-runner">
            <div className="creative-section-title"><div><span className="eyebrow">PROVIDER WORKFLOWS</span><h2>Choose a connected tool</h2></div><button onClick={onConnect}>API settings</button></div>
            <p className="creative-muted">AI tools run on the provider. Local adjustments stay on this Mac. Model access and charges depend on your account.</p>
            {!options.length && <p role="status">Loading documented workflow availability…</p>}
            <div className="creative-workflow-grid">{options.map(item => <button key={item.id} className={workflowId === item.id ? 'chosen' : ''} onClick={() => selectWorkflow(item)}><strong>{item.label}</strong><small>{item.available ? 'Documented API' : 'Unavailable'} · {item.provider}</small><span>{item.description}</span></button>)}</div>
            {currentWorkflow?.category === category && <div className="creative-tool-form">
                <h3>{currentWorkflow.label}</h3><CostPreview workflowId={currentWorkflow.id} input={inputs} provider={currentWorkflow.provider} />
                {currentWorkflow.documentation && <a href={currentWorkflow.documentation} target="_blank" rel="noopener noreferrer">Official workflow documentation ↗</a>}
                {!currentWorkflow.available && <p className="creative-alert">{currentWorkflow.reason || 'No verified public API contract is available for this operation.'}</p>}
                {pendingMedia.source && category === 'image' && <p className="creative-muted">Saved source: {pendingMedia.source.name}{pendingMedia.mask ? ' · Mask saved' : ''}. Library files may need a provider-supported upload before AI processing.</p>}
                {currentWorkflow.fields.map(field => <label key={field.id}>{field.label}{field.required ? ' *' : ''}{['image', 'images', 'video', 'audio'].includes(field.type) ? mediaPicker(field) : field.type === 'boolean' ? <input type="checkbox" checked={Boolean(inputs[field.id])} onChange={event => { setInputs(current => ({ ...current, [field.id]: event.target.checked })); setReview(false); requestId.current = null; }} /> : field.type === 'select' ? <select value={String(inputs[field.id] ?? '')} onChange={event => { setInputs(current => ({ ...current, [field.id]: event.target.value })); setReview(false); requestId.current = null; }}><option value="">Provider default</option>{field.options?.map(option => <option value={String(option)} key={String(option)}>{String(option)}</option>)}</select> : field.type === 'textarea' ? <textarea rows={4} maxLength={20000} value={String(inputs[field.id] ?? '')} onChange={event => { setInputs(current => ({ ...current, [field.id]: event.target.value })); setReview(false); requestId.current = null; }} /> : <input type={field.type === 'number' ? 'number' : 'text'} value={String(inputs[field.id] ?? '')} onChange={event => { setInputs(current => ({ ...current, [field.id]: field.type === 'number' && event.target.value !== '' ? Number(event.target.value) : event.target.value })); setReview(false); requestId.current = null; }} />}</label>)}
                {!configured[currentWorkflow.provider] && <p className="creative-alert">{currentWorkflow.provider} credentials are not configured. Connect this provider in API settings.</p>}
                {!review ? <button className="primary" disabled={!currentWorkflow.available || !configured[currentWorkflow.provider] || busy} onClick={() => setReview(true)}>Review generation</button> : <div className="creative-review"><strong>Review before spending</strong><p>{currentWorkflow.label} will receive the inputs shown above. Review the price estimate above. Confirm the current provider rate when an estimate is unavailable. Submission can consume API balance.</p><button className="primary" disabled={busy} onClick={() => void startJob()}>{busy ? <Loader2 className="spin" size={14} /> : <Sparkles size={14} />} Submit paid generation</button><button onClick={() => setReview(false)}>Back to editing</button></div>}
            </div>}
        </section>;
    }
    function elementSelector() {
        return <div className="creative-check-list">{workspace.elements.map(element => <label key={element.id}><input type="checkbox" checked={selectedElements.includes(element.id)} onChange={event => setSelectedElements(current => event.target.checked ? [...current, element.id] : current.filter(id => id !== element.id))} />{element.name} <small>{element.kind}</small></label>)}</div>;
    }
    const active = panels.find(item => item.id === panel)!;
    return <div className="creative-suite">
        <aside className="creative-sidebar"><span className="eyebrow">CINQRA CREATIVE SUITE</span>{panels.map((item, index) => <button key={item.id} className={panel === item.id ? 'selected' : ''} onClick={() => { setPanel(item.id); setError(''); setMessage(''); setReview(false); document.querySelector('.cq-main')?.scrollTo({ top: 0 }); }}><span>{String(index + 1).padStart(2, '0')}</span><div>{item.label}<small>{item.note}</small></div></button>)}</aside>
        <div className="creative-body"><div className="creative-top"><div><span className="eyebrow">YOUR IDEAS. ONE WORKSPACE.</span><h1>{active.label}</h1><p>{active.note}</p></div><button onClick={() => void perform(async () => { await refresh(); await refreshAssets(); const availability = await api<{ workflows: Workflow[]; configured: Record<string, boolean> }>('/api/creative/workflows'); setWorkflows(availability.workflows); setConfigured(availability.configured); notify('Workspace refreshed.'); })}><RefreshCw size={14} /> Refresh</button></div>
            {error && <div className="creative-alert" role="alert">{error}</div>}{message && <div className="creative-success" role="status"><Check size={14} />{message}</div>}
            <ProviderHealth /><div className="creative-project-bar"><label>Active project<select value={projectId} onChange={event => setProjectId(event.target.value)}><option value="">Select a project</option>{workspace.projects.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><form onSubmit={event => { event.preventDefault(); const form = event.currentTarget; const name = String(new FormData(form).get('name') ?? '').trim(); if (!name) return; void perform(async () => { const id = newId(), now = new Date().toISOString(); await mutate('put', 'projects', { id, name, brief: '', createdAt: now, updatedAt: now }); setProjectId(id); form.reset(); notify('Project created.'); }); }}><input name="name" aria-label="New project name" placeholder="New project name" maxLength={120} required /><button disabled={busy}><Plus size={14} /> New project</button></form></div>

            <div hidden={panel !== 'image' && panel !== 'layers'}><ImageWorkspace onSave={async file => { await upload(file); notify('Composite saved in your asset library.'); }} onAI={(operation, source, mask) => { void imageAI(operation, source, mask); }} />{workflowPanel('image')}</div>
            <div hidden={panel !== 'video'}><VideoWorkspace assets={assets} onSaved={async () => { await refreshAssets(); notify('Video export saved in your asset library.'); }} /><section className="creative-card"><h2>Your footage</h2><p className="creative-muted">Upload a clip to preview and reuse in a compatible workflow. Reference files are limited to 64 MB per request.</p><AssetUpload busy={busy} accept="video/*" onUpload={file => perform(async () => { await upload(file); notify('Clip added to your library.'); })} /><div className="creative-media-grid">{assets.filter(asset => asset.mimeType.startsWith('video/')).map(asset => <article key={asset.id}><video src={asset.url} controls preload="metadata" /><strong>{asset.name}</strong></article>)}</div></section>{workflowPanel('video')}</div>
            {panel === 'elements' && <><section className="creative-card"><h2>Create a reusable element</h2><ElementForm assets={assets} busy={busy} onSave={record => perform(async () => { await mutate('put', 'elements', { ...record, id: newId(), createdAt: new Date().toISOString() }); notify('Element saved for reuse.'); })} /><AssetUpload busy={busy} accept="image/*,video/*,audio/*" onUpload={file => perform(async () => { await upload(file); notify('Asset saved.'); })} /></section><div className="creative-tiles">{workspace.elements.map(element => <article className="creative-card" key={element.id}><AssetPreview asset={assets.find(asset => element.assetIds.includes(asset.id))} /><small>{element.kind}</small><h3>{element.name}</h3><p>{element.description}</p><button onClick={() => { setSelectedElements([element.id]); setPanel('characters'); }}>Use in a scene</button><button aria-label={`Delete element ${element.name}`} disabled={busy} onClick={() => void perform(async () => { await mutate('remove', 'elements', undefined, element.id); notify('Element removed.'); })}><Trash2 size={14} /></button></article>)}</div></>}
            {panel === 'characters' && <><section className="creative-card"><h2>Keep a consistent cast</h2><p>Choose saved characters, locations and props. CINQRA preserves their descriptions and reference assets with each storyboard shot.</p>{elementSelector()}<label>Scene description<textarea rows={5} value={continuityPrompt} onChange={event => setContinuityPrompt(event.target.value)} placeholder="What happens in this shot?" /></label><label>Generation brief<textarea readOnly rows={7} value={continuityBrief(continuityPrompt, chosenElements)} /></label><div className="creative-reference-strip">{chosenElements.flatMap(element => element.assetIds).map((id, index) => <AssetPreview key={`${id}-${index}`} asset={assets.find(asset => asset.id === id)} />)}</div><p className="creative-muted">Text guidance alone cannot guarantee identity. Use the saved reference images with a model that accepts them. Studio transfer copies text; attach the references shown above in the selected model.</p><button className="primary" disabled={!continuityPrompt.trim()} onClick={() => onGenerate(continuityBrief(continuityPrompt, chosenElements), 'image')}>Review in Image Studio</button><button disabled={!projectId || !continuityPrompt.trim() || busy} onClick={() => void perform(async () => { await mutate('put', 'shots', { id: newId(), projectId, title: 'Character scene', prompt: continuityPrompt, duration: 5, elementIds: selectedElements, assetIds: [...new Set(chosenElements.flatMap(element => element.assetIds))], order: projectShots.length }); notify('Scene and references saved to storyboard.'); })}>Save as storyboard shot</button></section>{workflowPanel('image')}</>}
            {panel === 'director' && <section className="creative-card"><h2>Talk through your next scene</h2><p className="creative-muted">Uses Google Gemini through your Google AI Studio key. Each request can incur provider charges. Suggestions never trigger image/video generation.</p><label>Your brief<textarea rows={5} maxLength={12000} value={directorBrief} onChange={event => setDirectorBrief(event.target.value)} placeholder="Describe your story, audience and desired look…" /></label>{elementSelector()}<div className="creative-actions"><button className="primary" disabled={!directorBrief.trim() || busy} onClick={() => void perform(async () => { const result = await api<{ text: string; shots?: { title: string; prompt: string; duration: number }[] }>('/api/creative/director', json({ brief: directorBrief, mode: 'prompt', context: continuityBrief(project?.brief ?? '', chosenElements) })); setDirectorText(result.text); setSuggestedShots([]); notify('Prompt ready for your review.'); })}>Improve prompt</button><button disabled={!directorBrief.trim() || busy} onClick={() => void perform(async () => { const result = await api<{ text: string; shots?: { title: string; prompt: string; duration: number }[] }>('/api/creative/director', json({ brief: directorBrief, mode: 'storyboard', context: continuityBrief(project?.brief ?? '', chosenElements) })); setDirectorText(result.text); setSuggestedShots(result.shots ?? []); notify('Shot suggestions ready. Review before saving.'); })}>Suggest storyboard</button><button onClick={onConnect}>Connect Google key</button></div>{directorText && <><label>Editable Director result<textarea rows={9} value={directorText} onChange={event => setDirectorText(event.target.value)} /></label><button onClick={() => onGenerate(directorText, 'video')}>Review in Video Studio</button></>}{suggestedShots.length > 0 && <><div className="creative-shot-list">{suggestedShots.map((shot, index) => <article key={index}><h3>{shot.title} · {shot.duration}s</h3><textarea aria-label={`Director shot ${index + 1}`} value={shot.prompt} onChange={event => setSuggestedShots(current => current.map((item, i) => i === index ? { ...item, prompt: event.target.value } : item))} /></article>)}</div><button disabled={!projectId || busy} onClick={() => void perform(async () => { for (const [index, shot] of suggestedShots.entries()) await mutate('put', 'shots', { ...shot, id: newId(), projectId, elementIds: selectedElements, assetIds: [...new Set(chosenElements.flatMap(element => element.assetIds))], order: projectShots.length + index }); setPanel('storyboard'); notify('Reviewed shots saved.'); })}>Save reviewed shots to project</button></>}</section>}
            {panel === 'storyboard' && <><section className="creative-card"><h2>{project?.name ?? 'Select or create a project'}</h2><ShotForm elements={workspace.elements} assets={assets} disabled={!projectId || busy} onSave={record => perform(async () => { await mutate('put', 'shots', { ...record, id: newId(), projectId, order: projectShots.length }); notify('Shot added.'); })} /></section><div className="creative-shot-list">{projectShots.map((shot, index) => <article className="creative-card" key={shot.id}><div className="creative-section-title"><h3>{index + 1}. {shot.title} <small>{shot.duration}s</small></h3><div><button aria-label={`Move ${shot.title} up`} disabled={index === 0 || busy} onClick={() => void perform(async () => { for (const moved of moveShot(projectShots, shot.id, -1)) if (moved.order !== projectShots.find(item => item.id === moved.id)?.order) await mutate('put', 'shots', moved); })}><ArrowUp size={14} /></button><button aria-label={`Move ${shot.title} down`} disabled={index === projectShots.length - 1 || busy} onClick={() => void perform(async () => { for (const moved of moveShot(projectShots, shot.id, 1)) if (moved.order !== projectShots.find(item => item.id === moved.id)?.order) await mutate('put', 'shots', moved); })}><ArrowDown size={14} /></button><button aria-label={`Delete shot ${shot.title}`} onClick={() => void perform(async () => { await mutate('remove', 'shots', undefined, shot.id); })}><Trash2 size={14} /></button></div></div><p>{shot.prompt}</p>{(shot.sourceTaskId || shot.jobId) && <ProjectGeneration taskId={shot.sourceTaskId} jobId={shot.jobId} />}<div className="creative-reference-strip">{shot.assetIds.map(id => <AssetPreview asset={assets.find(asset => asset.id === id)} key={id} />)}</div><small>{shot.elementIds.map(id => workspace.elements.find(element => element.id === id)?.name).filter(Boolean).join(' · ')}</small><button onClick={() => onGenerate(continuityBrief(shot.prompt, workspace.elements.filter(element => shot.elementIds.includes(element.id))), 'video')}>Review shot in Video Studio</button></article>)}</div>{projectShots.length > 0 && <section className="creative-card"><h3>Sequence handoff</h3><p>{projectShots.length} shots · {projectShots.reduce((sum, shot) => sum + shot.duration, 0)} seconds planned. Individual shots require separate generation; this is not an assembled rendered film.</p><button onClick={() => download(`${project?.name ?? 'cinqra'}-storyboard.json`, { project, shots: projectShots, elements: workspace.elements.filter(element => projectShots.some(shot => shot.elementIds.includes(element.id))), assets: assets.filter(asset => projectShots.some(shot => shot.assetIds.includes(asset.id))) })}><Download size={14} /> Export storyboard</button><button onClick={() => void navigator.clipboard.writeText(storyBrief(projectShots, workspace.elements)).then(() => notify('Sequence brief copied.')).catch(() => setError('Clipboard unavailable. Export the storyboard instead.'))}><Copy size={14} /> Copy sequence brief</button></section>}</>}
            {['lipsync', 'audio', 'motion'].includes(panel) && <><section className="creative-card"><h2>{panel === 'lipsync' ? 'Create a talking performance' : panel === 'audio' ? 'Sound for your story' : 'Transfer a performance'}</h2><p>{panel === 'lipsync' ? 'Choose a documented lip-sync workflow and provide your character and audio.' : panel === 'audio' ? 'Choose text-to-speech, voice conversion or dubbing when a public API contract is available.' : 'Guide character or scene changes with reference footage and compatible models.'}</p><p className="creative-muted">Use media and voices you have permission to use. Library uploads accept images up to 20 MB and video/audio up to 64 MB.</p><AssetUpload busy={busy} accept="image/*,video/*,audio/*" onUpload={file => perform(async () => { await upload(file); notify('Reference saved.'); })} /></section>{workflowPanel(panel)}</>}
            {panel === 'marketing' && <><section className="creative-card"><h2>Build a product campaign</h2><div className="creative-two-col"><label>Product<input value={campaign.product} onChange={event => setCampaign(current => ({ ...current, product: event.target.value }))} /></label><label>Target audience<input value={campaign.audience} onChange={event => setCampaign(current => ({ ...current, audience: event.target.value }))} /></label></div><label>Format<select value={campaign.format} onChange={event => setCampaign(current => ({ ...current, format: event.target.value }))}>{['Product shot', 'Poster', 'Marketplace listing', 'UGC video', 'Graphic ad'].map(value => <option key={value}>{value}</option>)}</select></label><label>Campaign direction<textarea value={campaign.brief} onChange={event => setCampaign(current => ({ ...current, brief: event.target.value }))} /></label>{elementSelector()}<button disabled={!campaign.product.trim()} onClick={() => { const text = continuityBrief(`Create a ${campaign.format} for ${campaign.product}. Audience: ${campaign.audience}. ${campaign.brief}`, chosenElements); setDirectorBrief(text); setInputs(current => ({ ...current, prompt: text, target_audience: campaign.audience })); notify('Campaign brief prepared. Choose a workflow below, or open AI Director to develop it.'); }}>Prepare campaign brief</button><button onClick={() => setPanel('director')}>Develop with Director</button></section>{workflowPanel('marketing')}</>}
            {panel === 'team' && <><section className="creative-card"><h2>Shared project workspace</h2><p>Projects, elements, storyboards and the canvas below sync between clients connected to this same server. Updates refresh every 3 seconds.</p><p className="creative-muted">This Mac uses a local server. Remote teammates need a separately configured authenticated self-hosted server. No cloud account, public invite link or role system is claimed here.</p><label>Display name<input value={author} onChange={event => setAuthor(event.target.value)} maxLength={80} /></label><p className="creative-muted">Display names label shared posts; they are not verified identities. Workspace revision: {workspace.revision}.</p></section>{project && <SharedCanvas key={project.id} project={project} busy={busy} onSave={value => perform(async () => { await mutate('put', 'projects', { ...value, updatedAt: new Date().toISOString() }); notify('Shared project updated.'); }, true)} />}</>}
            {panel === 'community' && <><section className="creative-card"><h2>Workspace community</h2><p>Publish a prompt and reference assets to people using this workspace. Nothing is sent to Higgsfield or a public social network.</p><PostForm assets={assets} author={author} busy={busy} onSave={record => perform(async () => { await mutate('put', 'posts', { ...record, id: newId(), likes: 0, createdAt: new Date().toISOString() }); notify('Post shared in this workspace.'); })} /></section><div className="creative-tiles">{workspace.posts.map(post => <article className="creative-card" key={post.id}><AssetPreview asset={assets.find(asset => post.assetIds.includes(asset.id))} /><small>{post.author}{post.sourceId ? ' · Remix' : ''}</small><h3>{post.title}</h3><p>{post.prompt}</p><button disabled={busy} onClick={() => void perform(async () => { await mutate('like', 'posts', undefined, post.id); })}>Like · {post.likes}</button><button disabled={busy} onClick={() => void perform(async () => { await mutate('remix', 'posts', { author }, post.id); notify('Remix created with source attribution.'); })}>Remix</button><button onClick={() => onGenerate(post.prompt, 'image')}>Use prompt</button><button aria-label={`Delete post ${post.title}`} onClick={() => void perform(async () => { await mutate('remove', 'posts', undefined, post.id); })}><Trash2 size={14} /></button></article>)}</div></>}
            {panel === 'integrations' && <Integrations project={project} workspace={workspace} assets={assets} />}

            <section className="creative-card creative-assets"><div className="creative-section-title"><h2>Asset library <small>{assets.length} files</small></h2><AssetUpload busy={busy} accept="image/*,video/*,audio/*" onUpload={file => perform(async () => { await upload(file); notify('Asset saved.'); })} /></div><div className="creative-asset-strip">{assets.map(asset => <article key={asset.id}><AssetPreview asset={asset} /><span>{asset.name}</span><a href={asset.url} download={asset.name}>Download</a></article>)}</div>{!assets.length && <p className="creative-muted">Upload references or save an image composite. Assets are stored on this workspace server.</p>}</section>
            <section className="creative-card"><h2>Creative workflow history</h2>{!jobs.length && <p className="creative-muted">Submitted workflow jobs appear here. No sample results are presented as generated work.</p>}<div className="creative-job-list">{jobs.map(job => <article key={job.id}><div className="creative-section-title"><strong>{workflows.find(item => item.id === job.workflowId)?.label ?? job.workflowId}</strong><small>{job.status}</small></div><small>{job.id}</small><button onClick={() => {
    const workflow = workflows.find(item => item.id === job.workflowId);
    if (!workflow) return;
    setWorkflowId(workflow.id); setInputs(structuredClone(job.input ?? {})); requestId.current = null; setReview(false); setPanel(workflow.category as Panel); notify('Settings restored. Review inputs and cost before submitting.');
}}>Reuse / review retry</button><button onClick={() => {
    const workflow = workflows.find(item => item.id === job.workflowId);
    if (!workflow) return;
    const variation = structuredClone(job.input ?? {}); delete variation.seed;
    setWorkflowId(workflow.id); setInputs(variation); requestId.current = null; setReview(false); setPanel(workflow.category as Panel); notify('Variation prepared with a fresh seed. Review before spending.');
}}>Prepare variation</button>{job.error && <p role="alert">{job.error}</p>}{job.outputs?.map((output, index) => <div key={index}>{output.mimeType?.startsWith('audio/') ? <audio src={output.url} controls /> : output.mimeType?.startsWith('video/') || /\.(mp4|webm)(\?|$)/i.test(output.url) ? <video src={output.url} controls /> : <img src={output.url} alt="Generated result" loading="lazy" />}<a href={output.url} target="_blank" rel="noopener noreferrer">Open / download result ↗</a></div>)}</article>)}</div></section>
        </div>
    </div>;
}

function AssetPreview({ asset }: { asset?: Asset }) {
    if (!asset) return <div className="creative-no-preview"><Layers size={22} /></div>;
    if (asset.mimeType.startsWith('image/')) return <img src={asset.url} alt={asset.name} loading="lazy" />;
    if (asset.mimeType.startsWith('video/')) return <video src={asset.url} controls preload="metadata" />;
    return <audio src={asset.url} controls preload="metadata" />;
}
function AssetUpload({ accept, busy, onUpload }: { accept: string; busy: boolean; onUpload: (file: File) => Promise<void> }) {
    const [error, setError] = useState('');
    return <label className="creative-upload">Upload reference <input type="file" accept={accept} disabled={busy} onChange={event => { const file = event.target.files?.[0]; if (file) void onUpload(file).catch(error => setError(error.message)); event.target.value = ''; }} />{error && <span role="alert">{error}</span>}</label>;
}
function AssetChecks({ assets }: { assets: Asset[] }) {
    return <fieldset><legend>Reference assets</legend><div className="creative-check-list">{assets.map(asset => <label key={asset.id}><input type="checkbox" name="assetIds" value={asset.id} />{asset.name}</label>)}</div>{!assets.length && <small>Upload reference files into the asset library first.</small>}</fieldset>;
}
function ElementForm({ assets, busy, onSave }: { assets: Asset[]; busy: boolean; onSave: (record: Omit<Element, 'id' | 'createdAt'>) => Promise<void> }) {
    return <form onSubmit={event => { event.preventDefault(); const form = event.currentTarget, data = new FormData(form); void onSave({ name: String(data.get('name')), kind: String(data.get('kind')) as Element['kind'], description: String(data.get('description')), assetIds: data.getAll('assetIds').map(String) }); }}><div className="creative-two-col"><label>Element name<input name="name" maxLength={120} required /></label><label>Type<select name="kind">{['character', 'location', 'prop', 'product'].map(value => <option key={value}>{value}</option>)}</select></label></div><label>Identity and continuity notes<textarea name="description" rows={3} maxLength={8000} placeholder="Face, costume, colors, shape and details to preserve…" /></label><AssetChecks assets={assets} /><button className="primary" disabled={busy}><Plus size={14} /> Save element</button></form>;
}
function ShotForm({ elements, assets, disabled, onSave }: { elements: Element[]; assets: Asset[]; disabled: boolean; onSave: (record: Pick<Shot, 'title' | 'prompt' | 'duration' | 'elementIds' | 'assetIds'>) => Promise<void> }) {
    return <form onSubmit={event => { event.preventDefault(); const data = new FormData(event.currentTarget); void onSave({ title: String(data.get('title')), prompt: String(data.get('prompt')), duration: Number(data.get('duration')), elementIds: data.getAll('elementIds').map(String), assetIds: data.getAll('assetIds').map(String) }); }}><div className="creative-two-col"><label>Shot title<input name="title" maxLength={120} required /></label><label>Planned duration (seconds)<input name="duration" type="number" min={1} max={120} defaultValue={5} required /></label></div><label>Shot prompt<textarea name="prompt" maxLength={12000} rows={4} required /></label><fieldset><legend>Continuity elements</legend><div className="creative-check-list">{elements.map(element => <label key={element.id}><input type="checkbox" name="elementIds" value={element.id} />{element.name}</label>)}</div></fieldset><AssetChecks assets={assets} /><button className="primary" disabled={disabled}><Plus size={14} /> Add shot</button></form>;
}
function PostForm({ assets, author, busy, onSave }: { assets: Asset[]; author: string; busy: boolean; onSave: (record: Pick<Post, 'title' | 'prompt' | 'assetIds' | 'author'>) => Promise<void> }) {
    return <form onSubmit={event => { event.preventDefault(); const data = new FormData(event.currentTarget); void onSave({ title: String(data.get('title')), prompt: String(data.get('prompt')), author, assetIds: data.getAll('assetIds').map(String) }); }}><label>Post title<input name="title" maxLength={120} required /></label><label>Prompt<textarea name="prompt" rows={3} maxLength={12000} required /></label><AssetChecks assets={assets} /><button className="primary" disabled={busy}><Send size={14} /> Share in workspace as {author}</button></form>;
}
function SharedCanvas({ project, busy, onSave }: { project: Project; busy: boolean; onSave: (project: Project) => Promise<void> }) {
    const [brief, setBrief] = useState(project.brief);
    const [nodes, setNodes] = useState<CanvasNode[]>(project.canvas?.nodes ?? []);
    const [dirty, setDirty] = useState(false);
    const [baseUpdated, setBaseUpdated] = useState(project.updatedAt);
    const [drag, setDrag] = useState<{ id: string; pointer: number; startX: number; startY: number; x: number; y: number } | null>(null);
    const changedElsewhere = project.updatedAt !== baseUpdated;
    const shownNodes = !dirty && changedElsewhere ? project.canvas?.nodes ?? [] : nodes;
    const shownBrief = !dirty && changedElsewhere ? project.brief : brief;
    function beginEdit() { if (!dirty) { setNodes(project.canvas?.nodes ?? []); setBrief(project.brief); setBaseUpdated(project.updatedAt); } setDirty(true); }
    return <section className="creative-card"><h2>Live project canvas</h2>{changedElsewhere && dirty && <p className="creative-alert">Another client updated this project. Reload their version before saving to prevent overwriting their changes.</p>}<label>Shared project brief<textarea rows={4} value={shownBrief} onChange={event => { beginEdit(); setBrief(event.target.value); }} /></label><div className="creative-actions"><button onClick={() => { const current = shownNodes; beginEdit(); setNodes([...current, { id: newId(), text: 'New creative idea', x: 30 + current.length % 3 * 190, y: 25 + Math.floor(current.length / 3) * 120 }]); }}><Plus size={14} /> Add canvas note</button><button disabled={!dirty || busy || changedElsewhere} className="primary" onClick={() => void onSave({ ...project, brief, canvas: { nodes } }).then(() => { setDirty(false); }).catch(() => {})}>Save shared changes</button><button onClick={() => { setBrief(project.brief); setNodes(project.canvas?.nodes ?? []); setBaseUpdated(project.updatedAt); setDirty(false); }}>Reload shared version</button><span className="creative-muted">{dirty ? 'Unsaved local edits' : 'Showing shared state'}</span></div><div className="creative-shared-canvas">{shownNodes.map(node => <article key={node.id} style={{ left: node.x, top: node.y }}><div className="creative-drag-handle" onPointerDown={event => { if ((event.target as HTMLElement).closest('button')) return; const current = shownNodes; beginEdit(); setNodes(current); event.currentTarget.setPointerCapture(event.pointerId); setDrag({ id: node.id, pointer: event.pointerId, startX: event.clientX, startY: event.clientY, x: node.x, y: node.y }); }} onPointerMove={event => { if (!drag || drag.id !== node.id || drag.pointer !== event.pointerId) return; setNodes(current => current.map(item => item.id === node.id ? { ...item, x: Math.max(0, Math.min(560, drag.x + event.clientX - drag.startX)), y: Math.max(0, Math.min(650, drag.y + event.clientY - drag.startY)) } : item)); }} onPointerUp={() => setDrag(null)} onPointerCancel={() => setDrag(null)}>Move note<button aria-label="Delete canvas note" onClick={() => { const current = shownNodes; beginEdit(); setNodes(current.filter(item => item.id !== node.id)); }}><Trash2 size={12} /></button></div><textarea aria-label="Canvas note" value={node.text} maxLength={2000} onChange={event => { const current = shownNodes; beginEdit(); setNodes(current.map(item => item.id === node.id ? { ...item, text: event.target.value } : item)); }} /></article>)}</div></section>;
}
function Integrations({ project, workspace, assets }: { project?: Project; workspace: Workspace; assets: Asset[] }) {
    return <section className="creative-card"><h2>Bring CINQRA into your tools</h2><p className="creative-muted">Local integration sources ship with this project. CLI and MCP use the same protected workspace API. Adobe requires its host and UXP developer tooling.</p><div className="creative-integration-grid"><article><h3>CLI</h3><p>List assets, export projects, prepare Director requests and submit documented jobs.</p><code>node integrations/cinqra.mjs help</code></article><article><h3>MCP</h3><p>Connect a compatible MCP client to the included stdio server.</p><code>node integrations/mcp-server.mjs</code></article><article><h3>Adobe Photoshop</h3><p>Load the UXP panel from integrations/adobe-uxp. Browse library assets and place supported images into your document.</p><small>Adobe host execution requires separate verification.</small></article><article><h3>After Effects / Premiere</h3><p>Download media from the library and import with the scripts in integrations/adobe-handoff. These are editor handoff scripts, not installed live generation panels.</p><code>after-effects-import.jsx · premiere-import.jsx</code></article></div><h3>Portable project handoff</h3><p>Export a project manifest containing shots, continuity elements and asset links. Links require access to this workspace server.</p><button disabled={!project} onClick={() => download(`${project?.name ?? 'cinqra'}-handoff.json`, { version: 1, project, shots: workspace.shots.filter(shot => shot.projectId === project?.id), elements: workspace.elements, assets })}><Download size={14} /> Export project manifest</button></section>;
}
