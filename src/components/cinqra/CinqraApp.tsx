'use client';

/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowRight, Bookmark, Check, CircleHelp, Clapperboard, Copy, Film, FolderOpen, Image as ImageIcon, KeyRound, Layers3, Loader2, Plus, Search, Settings2, SlidersHorizontal, Sparkles, Trash2, Video, WandSparkles, Workflow, X } from 'lucide-react';
import { CommandBar } from '@/components/command-bar/CommandBar';
import { HistoryWorkbench } from '@/components/tasks/HistoryWorkbench';
import { ResultsGrid } from '@/components/tasks/ResultsGrid';
import { ProviderHealth } from '@/components/creative/Reliability';
import { CreativeStudio } from '@/components/creative/CreativeStudio';
import { HIGGSFIELD_DEFINITIONS } from '@/models/capabilities/higgsfield';
import { IMAGE_CAPABILITIES } from '@/models/capabilities/image';
import { VIDEO_CAPABILITIES } from '@/models/capabilities/video';
import { recipes, effects, categories, type Recipe, type View } from './catalog';
import './cinqra.css';

type Provider = { id: string; configured: boolean };
type Board = { id: string; name: string; created: string };
type CanvasNode = { id: string; kind: 'prompt' | 'style' | 'output'; text: string; x: number; y: number };
type WorkflowDraft = { nodes: CanvasNode[]; edges: [string, string][] };
const initialWorkflow: WorkflowDraft = {
  nodes: [
    { id: 'scene', kind: 'prompt', text: 'A lone explorer walks across desert dunes at golden hour.', x: 50, y: 95 },
    { id: 'look', kind: 'style', text: 'Anamorphic lens, warm film tones, slow cinematic dolly forward.', x: 365, y: 170 },
    { id: 'render', kind: 'output', text: 'Video', x: 680, y: 95 },
  ], edges: [['scene', 'look'], ['look', 'render']],
};
const providerNames: Record<string, string> = { higgsfield: 'Higgsfield API', freepik: 'Freepik', 'google-ai-studio': 'Google AI Studio', 'vercel-ai-gateway': 'Vercel AI Gateway', 'google-vertex': 'Google Vertex AI', toapis: 'ToAPIs' };
const navigation: { id: View; label: string }[] = [
  { id: 'explore', label: 'Explore' }, { id: 'image', label: 'Image' }, { id: 'video', label: 'Video' },
  { id: 'cinema', label: 'Cinema Studio' }, { id: 'effects', label: 'Effects' }, { id: 'canvas', label: 'Canvas' },
  { id: 'creative', label: 'Creative suite' },
];
function readSaved<T>(name: string, fallback: T): T {
  try { const raw = localStorage.getItem(name); return raw ? JSON.parse(raw) : fallback; } catch { return fallback; }
}
function downloadJson(name: string, value: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Mark() { return <span className="brand-mark"><img src="/cinqra/app-icon.png" alt="" /></span>; }

export function CinqraApp() {
  const [view, setView] = useState<View>('explore');
  const [mode, setMode] = useState<'image' | 'video'>('image');
  const [category, setCategory] = useState('All inspiration');
  const [search, setSearch] = useState('');
  const [saved, setSaved] = useState<string[]>([]);
  const [boards, setBoards] = useState<Board[]>([]);
  const [draft, setDraft] = useState('');
  const [composerKey, setComposerKey] = useState(0);
  const [selected, setSelected] = useState<Recipe | null>(null);
  const [modal, setModal] = useState<'connections' | 'help' | 'project' | null>(null);
  const [projectName, setProjectName] = useState('');
  const [providers, setProviders] = useState<Provider[]>([]);
  const [editableKeys, setEditableKeys] = useState(false);
  const [connectionError, setConnectionError] = useState('');
  const [keyProvider, setKeyProvider] = useState('higgsfield');
  const [keyValue, setKeyValue] = useState('');
  const [keySecret, setKeySecret] = useState('');
  const [savingKey, setSavingKey] = useState(false);
  const [toast, setToast] = useState('');
  const [camera, setCamera] = useState('ARRI Alexa 35');
  const [lens, setLens] = useState('35mm anamorphic');
  const [movement, setMovement] = useState('Slow dolly in');
  const [scene, setScene] = useState('A lone explorer crosses a sunlit desert. Wind moves through flowing fabric.');
  const [workflow, setWorkflow] = useState<WorkflowDraft>(initialWorkflow);
  const [connectFrom, setConnectFrom] = useState<string | null>(null);
  const [canvasMode, setCanvasMode] = useState<'image' | 'video'>('video');
  const [historyMode, setHistoryMode] = useState<'image' | 'video'>('image');
  const [ready, setReady] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const configured = providers.filter(provider => provider.configured).length;
  const modelCount = Object.keys(IMAGE_CAPABILITIES).length + Object.keys(VIDEO_CAPABILITIES).length;

  useEffect(() => {
    const hydrate = window.setTimeout(() => {
    setSaved(readSaved('cinqra-saved', [])); setBoards(readSaved('cinqra-boards', []));
    const stored = readSaved<WorkflowDraft>('cinqra-workflow', initialWorkflow);
    if (stored && Array.isArray(stored.nodes) && Array.isArray(stored.edges)) setWorkflow(stored);
    const onHash = () => {
      const value = location.hash.slice(1) as View;
      if (['explore', 'image', 'video', 'cinema', 'effects', 'canvas', 'library', 'creative'].includes(value)) {
        setView(value); if (value === 'image' || value === 'video') setMode(value);
      }
    };
    onHash(); setReady(true);
    }, 0);
    const onNavigation = () => {
      const value = window.location.hash.slice(1) as View;
      if (['explore', 'image', 'video', 'cinema', 'effects', 'canvas', 'library', 'creative'].includes(value)) {
        setView(value); if (value === 'image' || value === 'video') setMode(value);
      }
    };
    window.addEventListener('hashchange', onNavigation);
    return () => { window.clearTimeout(hydrate); window.removeEventListener('hashchange', onNavigation); };
  }, []);
  useEffect(() => { if (ready) localStorage.setItem('cinqra-saved', JSON.stringify(saved)); }, [saved, ready]);
  useEffect(() => { if (ready) localStorage.setItem('cinqra-boards', JSON.stringify(boards)); }, [boards, ready]);
  useEffect(() => { if (ready) localStorage.setItem('cinqra-workflow', JSON.stringify(workflow)); }, [workflow, ready]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 3500); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => {
    if (!modal && !selected) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setModal(null); setSelected(null); setKeyValue(''); setKeySecret(''); }
      if (event.key !== 'Tab') return;
      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input, select, textarea, a[href]') ?? []);
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', onEscape); return () => { document.removeEventListener('keydown', onEscape); previousFocus?.focus(); };
  }, [modal, selected]);
  async function loadProviders() {
    try {
      const response = await fetch('/api/connections'); if (!response.ok) throw new Error('Could not load provider configuration.');
      const data = await response.json(); setProviders(data.providers); setEditableKeys(data.editable); setConnectionError('');
    } catch { setConnectionError('Could not load provider configuration. Try again.'); }
  }
  useEffect(() => { const timer = window.setTimeout(() => { void loadProviders(); }, 0); return () => window.clearTimeout(timer); }, []);
  useEffect(() => {
    const restore = (event: Event) => {
      const detail = (event as CustomEvent<{prompt: string; mode: 'image' | 'video'}>).detail;
      setDraft(detail.prompt); setMode(detail.mode); setView(detail.mode); setComposerKey(value => value + 1);
      window.history.pushState(null, '', '#' + detail.mode);
    };
    window.addEventListener('cinqra:reuse', restore);
    return () => window.removeEventListener('cinqra:reuse', restore);
  }, []);
  function navigate(next: View) {
    setView(next); window.history.pushState(null, '', `#${next}`); setSearch(''); mainRef.current?.scrollTo(0, 0);
    if (next === 'image' || next === 'video') setMode(next);
  }
  function launch(prompt: string, nextMode: 'image' | 'video') {
    setDraft(prompt); setComposerKey(value => value + 1); setSelected(null); navigate(nextMode);
  }
  function saveRecipe(id: string) { setSaved(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id]); }
  async function saveKey(event: React.FormEvent) {
    event.preventDefault(); if (savingKey) return; setSavingKey(true); setConnectionError('');
    try {
      const response = await fetch('/api/connections', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider: keyProvider, key: keyValue, ...(keyProvider === 'higgsfield' ? { secret: keySecret } : {}) }) });
      if (!response.ok) throw new Error('Could not save key. Check the key format and local server access.');
      const data = await response.json(); setProviders(data.providers); window.dispatchEvent(new Event('cinqra:connections-updated')); setKeyValue(''); setKeySecret(''); setToast(keyProvider === 'higgsfield' ? 'Higgsfield credentials saved. Model access is unverified.' : 'API key saved on this Mac.');
    } catch (error) { setConnectionError(error instanceof Error ? error.message : 'Could not save key.'); }
    finally { setSavingKey(false); }
  }
  const visibleRecipes = recipes.filter(recipe => (category === 'All inspiration' || recipe.category === category) && `${recipe.title} ${recipe.category} ${recipe.prompt}`.toLowerCase().includes(search.toLowerCase()));
  const isStudio = view === 'image' || view === 'video';

  function recipeCard(recipe: Recipe, compact = false) {
    return <article className={`recipe-card ${compact ? 'compact' : ''}`} key={recipe.id}>
      <button className="recipe-open" onClick={() => setSelected(recipe)} aria-label={`Preview ${recipe.title}`}>
        <img src={recipe.image} alt={recipe.title} loading="lazy" />
        <span className="recipe-shade" /><span className="media-label">{recipe.mode === 'video' ? <Video size={12} /> : <ImageIcon size={12} />}{recipe.category}</span>
        <span className="recipe-caption"><span>{recipe.title}</span><ArrowRight size={20} /></span>
      </button>
      <button className={`save-recipe ${saved.includes(recipe.id) ? 'is-saved' : ''}`} aria-label={`${saved.includes(recipe.id) ? 'Unsave' : 'Save'} ${recipe.title}`} onClick={() => saveRecipe(recipe.id)}><Bookmark size={16} fill={saved.includes(recipe.id) ? 'currentColor' : 'none'} /></button>
    </article>;
  }

  function runWorkflow() {
    const output = workflow.nodes.find(node => node.kind === 'output');
    if (!output) { setToast('Add an output node first.'); return; }
    const visited = new Set<string>(); const ordered: CanvasNode[] = []; const visiting = new Set<string>();
    function visit(id: string) {
      if (visiting.has(id)) throw new Error('Remove the circular connection before continuing.');
      if (visited.has(id)) return; visiting.add(id);
      workflow.edges.filter(edge => edge[1] === id).forEach(edge => visit(edge[0]));
      visiting.delete(id); visited.add(id); const node = workflow.nodes.find(item => item.id === id); if (node) ordered.push(node);
    }
    try { visit(output.id); } catch (error) { setToast((error as Error).message); return; }
    const text = ordered.filter(node => node.kind !== 'output').map(node => node.text.trim()).filter(Boolean).join(' ');
    if (!text) { setToast('Connect a scene prompt to your output.'); return; }
    launch(text, canvasMode); setToast('Workflow prepared. Review the prompt and model before generating.');
  }

  return <div className="cinqra-app">
    <header className="cq-header">
      <button className="cq-brand" onClick={() => navigate('explore')} aria-label="CINQRA home"><Mark /><span><strong>CINQRA</strong><small>AI CREATIVE STUDIO</small></span></button>
      <nav aria-label="Main navigation">{navigation.map(item => <button key={item.id} onClick={() => navigate(item.id)} className={view === item.id ? 'active' : ''}>{item.label}{item.id === 'canvas' && <span className="new-label">BETA</span>}</button>)}</nav>
      <div className="header-actions"><button className="icon-button help-button" aria-label="Help" onClick={() => setModal('help')}><CircleHelp size={17} /></button><button className="library-link" aria-label="My library" onClick={() => navigate('library')}><FolderOpen size={16} /><span>My library</span></button><button className="connection-button" onClick={() => setModal('connections')}><KeyRound size={14} /><span>{configured ? `${configured} configured` : 'Connect API'}</span></button><span className="avatar" title="Local workspace">C</span></div>
    </header>
    <main ref={mainRef} className={`cq-main ${isStudio ? 'studio-main' : ''}`}>
      {view === 'creative' && <CreativeStudio onConnect={() => setModal('connections')} onGenerate={(prompt, target) => launch(prompt, target)} />}
      {view === 'explore' && <>
        <div className="explore-top"><div className="section-kicker"><span className="pulse-dot" /> YOUR NEXT GREAT IDEA STARTS HERE</div><span className="quiet">Independent tools. Infinite possibilities.</span></div>
        <section className="hero" aria-label="Cinema, Reimagined">
          <img className="hero-photo" src="/cinqra/desert.jpg" alt="Sweeping desert dunes in cinematic light" />
          <div className="hero-gradient" /><div className="hero-content"><span className="eyebrow">THE CINQRA CREATIVE SUITE</span><h1>Cinema,<br /><em>Reimagined.</em></h1><p>From the first spark to the final frame.<br />Your vision. The world’s creative models. One studio.</p><div className="hero-actions"><button className="primary" onClick={() => navigate('video')}>Start creating <ArrowRight size={16} /></button><button className="hero-secondary" onClick={() => navigate('cinema')}><Clapperboard size={16} /> Explore Cinema Studio</button></div></div>
          <div className="hero-coordinate">CINQRA ORIGINALS <span>01 / 08</span></div><span className="hero-bottom">IMAGINATION HAS NO LIMITS. NEITHER SHOULD YOUR TOOLS.</span>
        </section>
        <div className="feature-row">
          <button onClick={() => navigate('image')}><span className="feature-icon"><ImageIcon /></span><span><strong>Image Studio</strong><small>Turn a thought into something extraordinary.</small></span><ArrowRight size={18} /></button>
          <button onClick={() => navigate('video')}><span className="feature-icon"><Film /></span><span><strong>Video Studio</strong><small>Give your imagination a little motion.</small></span><ArrowRight size={18} /></button>
          <button onClick={() => navigate('canvas')}><span className="feature-icon"><Workflow /></span><span><strong>Creative Canvas <b>BETA</b></strong><small>Connect ideas. Create your own workflow.</small></span><ArrowRight size={18} /></button>
        </div>
        <section className="inspiration-section"><div className="section-heading"><div><span className="eyebrow">A LITTLE INSPIRATION</span><h2>What will you create?</h2></div><label className="search-field"><Search size={16} /><input aria-label="Search inspiration" placeholder="Search inspiration" value={search} onChange={event => setSearch(event.target.value)} /><span>⌕</span></label></div>
          <div className="category-row">{categories.map(item => <button className={category === item ? 'selected' : ''} key={item} onClick={() => setCategory(item)}>{item}</button>)}<span className="category-note"><SlidersHorizontal size={13} /> Curated for creators</span></div>
          <div className="recipe-grid">{visibleRecipes.map(recipe => recipeCard(recipe))}</div>{!visibleRecipes.length && <div className="empty-state"><Search /><h3>No matching inspiration</h3><p>Try another search or category.</p><button onClick={() => { setSearch(''); setCategory('All inspiration'); }}>Clear filters</button></div>}
        </section><div className="byok-banner"><div><KeyRound size={21} /><span><strong>Your keys. Your creative freedom.</strong><small>Connect a provider. Pay for the generations you choose.</small></span></div><button onClick={() => setModal('connections')}>Set up your providers <ArrowRight size={16} /></button></div>
        <footer><span>CINQRA <small>AI CREATIVE STUDIO</small></span><p>Cinema, Reimagined.</p><button onClick={() => setModal('help')}>Studio guide <ArrowRight size={13} /></button></footer>
      </>}

      {isStudio && <><div className="workspace-heading"><div><span className="eyebrow">YOUR CREATIVE WORKSPACE</span><h1>{mode === 'image' ? 'Image' : 'Video'} Studio<span className="outline-label">BYOK</span></h1></div><div className="studio-actions"><button onClick={() => navigate('library')}><FolderOpen size={15} /> History</button><button onClick={() => setModal('connections')}><Settings2 size={15} /> Providers</button></div></div>
        {!configured && <div className="setup-notice"><KeyRound size={16} /><span>Bring your vision. Bring your API key.</span><button onClick={() => setModal('connections')}>Configure a provider <ArrowRight size={14} /></button></div>}
        <div className="studio-inspiration"><div className="mini-stack">{recipes.slice(mode === 'image' ? 1 : 0, mode === 'image' ? 4 : 3).map(recipe => <img src={recipe.image} alt="" key={recipe.id} />)}</div><span className="eyebrow">THE NEXT FRAME IS YOURS</span><h2>{mode === 'image' ? 'Make the imagined, real.' : 'Every great story starts with a frame.'}</h2><p>Describe your scene, choose a model, and make it yours.</p><div className="starter-chips">{recipes.filter(recipe => recipe.mode === mode).slice(0, 3).map(recipe => <button key={recipe.id} onClick={() => launch(recipe.prompt, mode)}><Sparkles size={12} />{recipe.title}</button>)}</div></div>
        <div className="generation-history"><HistoryWorkbench mode={mode} /><ResultsGrid mode={mode} /></div>
      </>}

      {view === 'effects' && <><div className="page-heading"><span className="eyebrow">A NEW PERSPECTIVE, ONE PROMPT AWAY</span><h1>Make a little movie magic.</h1><p>Camera moves and visual styles, ready for your next scene.</p></div><div className="effects-note"><WandSparkles size={15} /> These are editable prompt presets. Results depend on the model you choose.</div><div className="effects-grid">{effects.map((effect, index) => <button className="effect-card" key={effect.name} onClick={() => launch(effect.prompt, index === 4 || index === 5 ? 'image' : 'video')}><img src={recipes[index % recipes.length].image} alt="" /><div className="effect-overlay" /><span className="effect-number">0{index + 1}</span><span className="effect-symbol">{index === 1 ? '↻' : index === 0 ? '↔' : index === 2 ? 'Ⅱ' : index === 3 ? '↗' : '✧'}</span><div><h2>{effect.name}</h2><p>{effect.note}</p><span>Use preset <ArrowRight size={14} /></span></div></button>)}</div></>}

      {view === 'cinema' && <><div className="page-heading"><span className="eyebrow">THINK LIKE A DIRECTOR</span><h1>Cinema Studio<span className="outline-label">CINQRA</span></h1><p>Compose the shot. Set the mood. Tell your story.</p></div><div className="cinema-layout"><div className="cinema-preview"><img src="/cinqra/desert.jpg" alt="Cinematic desert reference" /><div className="viewfinder"><span>REC <i /></span><span>{lens}</span><div className="crosshair">+</div><span>{camera}</span><span>REFERENCE FRAME · 16:9</span></div><div className="cinema-caption"><Clapperboard size={20} /><span>YOUR DIRECTOR’S CHAIR<small>Build a cinematic prompt from your shot choices.</small></span></div></div><section className="cinema-controls"><h2>The shot list</h2><label>01 / CAMERA<select value={camera} onChange={event => setCamera(event.target.value)}>{['ARRI Alexa 35', 'RED V-Raptor', 'Sony Venice', '35mm film'].map(value => <option key={value}>{value}</option>)}</select></label><label>02 / LENS<select value={lens} onChange={event => setLens(event.target.value)}>{['35mm anamorphic', '24mm wide angle', '50mm prime', '85mm portrait', '100mm macro'].map(value => <option key={value}>{value}</option>)}</select></label><label>03 / MOVEMENT<select value={movement} onChange={event => setMovement(event.target.value)}>{['Slow dolly in', '360-degree orbit', 'Tracking shot', 'Aerial pullback', 'Locked off tripod', 'Handheld'].map(value => <option key={value}>{value}</option>)}</select></label><label>04 / YOUR SCENE<textarea value={scene} onChange={event => setScene(event.target.value)} rows={4} /></label><p className="control-note">Camera choices guide the prompt; they do not simulate physical hardware.</p><button className="primary" disabled={!scene.trim()} onClick={() => launch(`${scene.trim()} Shot on ${camera}, ${lens} lens, ${movement.toLowerCase()}, cinematic lighting, natural motion, detailed film texture.`, 'video')}>Prepare cinematic shot <ArrowRight size={16} /></button></section></div></>}

      {view === 'canvas' && <><div className="workspace-heading"><div><span className="eyebrow">YOUR IDEAS, CONNECTED</span><h1>Creative Canvas <span className="outline-label">BETA</span></h1></div><div className="studio-actions"><button onClick={() => downloadJson('cinqra-workflow.json', { version: 1, ...workflow, output: canvasMode })}><ArrowDownToLine size={15} /> Export</button><button className="primary" onClick={runWorkflow}>Prepare workflow <ArrowRight size={15} /></button></div></div><div className="canvas-toolbar"><div><button onClick={() => setWorkflow(current => ({ ...current, nodes: [...current.nodes, { id: crypto.randomUUID(), kind: 'prompt', text: '', x: 80 + current.nodes.length * 25, y: 300 }] }))}><Plus size={14} /> Prompt node</button><button onClick={() => setWorkflow(current => ({ ...current, nodes: [...current.nodes, { id: crypto.randomUUID(), kind: 'style', text: '', x: 350, y: 330 }] }))}><Plus size={14} /> Style node</button></div><span><Check size={13} /> Saved on this device</span><button onClick={() => { setWorkflow(initialWorkflow); setConnectFrom(null); }}>Reset canvas</button></div><div className="canvas-scroll"><div ref={canvasRef} className="workflow-canvas"><svg className="canvas-wires" width="1120" height="650" aria-hidden="true">{workflow.edges.map(([from, to]) => { const a = workflow.nodes.find(node => node.id === from); const b = workflow.nodes.find(node => node.id === to); if (!a || !b) return null; return <path key={`${from}-${to}`} d={`M ${a.x + 255} ${a.y + 66} C ${a.x + 310} ${a.y + 66}, ${b.x - 55} ${b.y + 66}, ${b.x} ${b.y + 66}`} fill="none" stroke="#9c7bfa" strokeWidth="2" />; })}</svg>{workflow.nodes.map((node, index) => <div className={`canvas-node ${connectFrom === node.id ? 'connecting' : ''}`} key={node.id} style={{ left: node.x, top: node.y }}><div className="node-heading" onPointerDown={event => { if ((event.target as HTMLElement).closest('button')) return; event.currentTarget.setPointerCapture(event.pointerId); event.currentTarget.dataset.dragX = String(event.clientX - node.x); event.currentTarget.dataset.dragY = String(event.clientY - node.y); }} onPointerMove={event => { if (!event.currentTarget.hasPointerCapture(event.pointerId)) return; const x = Math.max(0, Math.min(860, event.clientX - Number(event.currentTarget.dataset.dragX))); const y = Math.max(0, Math.min(430, event.clientY - Number(event.currentTarget.dataset.dragY))); setWorkflow(current => ({ ...current, nodes: current.nodes.map(item => item.id === node.id ? { ...item, x, y } : item) })); }} onPointerUp={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}><span>{node.kind === 'prompt' ? <ImageIcon size={14} /> : node.kind === 'style' ? <WandSparkles size={14} /> : <Film size={14} />} {node.kind === 'output' ? 'Output' : node.kind === 'style' ? 'Visual direction' : 'Scene prompt'}</span>{node.kind !== 'output' && <button aria-label={`Delete node ${index + 1}`} onClick={() => setWorkflow(current => ({ nodes: current.nodes.filter(item => item.id !== node.id), edges: current.edges.filter(edge => !edge.includes(node.id)) }))}><X size={13} /></button>}</div>{node.kind === 'output' ? <div className="output-node"><Clapperboard size={28} /><select aria-label="Workflow output" value={canvasMode} onChange={event => setCanvasMode(event.target.value as 'image' | 'video')}><option value="video">Video generation</option><option value="image">Image generation</option></select><small>Review model and settings in Studio.</small></div> : <textarea aria-label={`${node.kind} node ${index + 1}`} placeholder="Describe your idea…" value={node.text} onChange={event => setWorkflow(current => ({ ...current, nodes: current.nodes.map(item => item.id === node.id ? { ...item, text: event.target.value } : item) }))} />}<div className="node-connectors"><button disabled={!connectFrom || connectFrom === node.id} onClick={() => { if (connectFrom && connectFrom !== node.id) { setWorkflow(current => ({ ...current, edges: [...current.edges.filter(edge => !(edge[0] === connectFrom && edge[1] === node.id)), [connectFrom, node.id]] })); setConnectFrom(null); } }}>● Input</button>{node.kind !== 'output' && <button onClick={() => setConnectFrom(connectFrom === node.id ? null : node.id)}>Output ●</button>}</div></div>)}<div className="canvas-hint">{connectFrom ? 'Choose Input on another node to connect. Click Output again to cancel.' : 'Drag node headers to arrange. Connect Output to Input to build your prompt.'}</div></div></div><div className="canvas-bottom-note"><Workflow size={15} /> Canvas combines connected prompts into one generation brief. It does not execute multiple model jobs.</div></>}

      {view === 'library' && <><div className="workspace-heading"><div><span className="eyebrow">A HOME FOR YOUR IDEAS</span><h1>My library</h1></div><button className="primary" onClick={() => setModal('project')}><Plus size={15} /> New project</button></div><div className="library-summary"><div><FolderOpen /><strong>{boards.length}<small>Projects</small></strong></div><div><Bookmark /><strong>{saved.length}<small>Saved inspiration</small></strong></div><div><Layers3 /><strong>{modelCount}<small>Catalog entries</small></strong></div></div><div className="section-heading"><h2>Projects</h2><span className="quiet">Project boards stay on this device</span></div>{boards.length ? <div className="board-grid">{boards.map(board => <article key={board.id}><FolderOpen size={28} /><h3>{board.name}</h3><p>Created {new Date(board.created).toLocaleDateString()}</p><div><button onClick={() => { launch(`Project: ${board.name}. `, 'image'); }}>Create a frame <ArrowRight size={13} /></button><button aria-label={`Delete project ${board.name}`} onClick={() => { if (confirm(`Delete project board “${board.name}”? Generated media will remain in history.`)) setBoards(current => current.filter(item => item.id !== board.id)); }}><Trash2 size={14} /></button></div></article>)}</div> : <div className="empty-state small"><FolderOpen /><p>Give your next idea a home.</p><button onClick={() => setModal('project')}>Create your first project</button></div>}<div className="section-heading"><h2>Saved inspiration</h2><span className="quiet">{saved.length} saved</span></div><div className="recipe-grid">{recipes.filter(recipe => saved.includes(recipe.id)).map(recipe => recipeCard(recipe, true))}</div>{!saved.length && <div className="empty-state small"><Bookmark /><p>Save a look you love from Explore.</p><button onClick={() => navigate('explore')}>Find inspiration</button></div>}<div className="section-heading"><h2>Generation history</h2><div className="segmented">{(['image', 'video'] as const).map(value => <button className={historyMode === value ? 'selected' : ''} key={value} onClick={() => setHistoryMode(value)}>{value === 'image' ? 'Images' : 'Videos'}</button>)}</div></div><div className="library-history"><HistoryWorkbench mode={historyMode} /><ResultsGrid mode={historyMode} /></div></>}
    </main>
    {isStudio && <CommandBar key={composerKey} mode={mode} initialPrompt={draft} configuredProviders={providers.filter(provider => provider.configured).map(provider => provider.id)} onUnlockProvider={provider => { setKeyProvider(provider); setModal('connections'); }} onModeChange={next => { setMode(next); navigate(next); }} />}
    {toast && <div className="cq-toast" role="status"><Check size={15} />{toast}</div>}

    {(modal || selected) && <div className="modal-backdrop" onClick={() => { setModal(null); setSelected(null); setKeyValue(''); setKeySecret(''); }}><section ref={dialogRef} className={`cq-modal ${selected ? 'recipe-modal' : ''}`} role="dialog" aria-modal="true" aria-label={selected?.title ?? (modal === 'connections' ? 'Provider settings' : modal === 'project' ? 'New project' : 'Studio guide')} onClick={event => event.stopPropagation()}><button autoFocus className="modal-close icon-button" aria-label="Close dialog" onClick={() => { setModal(null); setSelected(null); setKeyValue(''); setKeySecret(''); }}><X size={18} /></button>
      {selected && <><img className="modal-preview" src={selected.image} alt={selected.title} /><div className="modal-content"><span className="eyebrow">{selected.category} / PROMPT RECIPE</span><h2>{selected.title}</h2><p className="recipe-prompt">{selected.prompt}</p><p className="control-note">Stock reference image, not a generated result. Your output will vary.</p><div className="modal-buttons"><button onClick={() => { void navigator.clipboard.writeText(selected.prompt).then(() => setToast('Prompt copied.')).catch(() => setToast('Copy unavailable. Select the prompt text to copy.')); }}><Copy size={15} /> Copy prompt</button><button className="primary" onClick={() => launch(selected.prompt, selected.mode)}>Use this recipe <ArrowRight size={15} /></button></div></div></>}
      {modal === 'connections' && <div className="modal-content"><ProviderHealth /><span className="eyebrow">YOUR MODELS. YOUR KEYS.</span><h2>Connect your creative tools.</h2><p>Keys stay on this Mac’s server. Provider usage is billed separately.</p><div className="provider-list">{providers.map(provider => <div key={provider.id}><span className="provider-icon">{(providerNames[provider.id] ?? provider.id)[0]}</span><span>{providerNames[provider.id] ?? provider.id}<small>{provider.configured ? 'Configuration saved · not verified' : 'Not configured'}</small></span><span className={provider.configured ? 'status-ready' : 'status-empty'}>{provider.configured ? <Check size={14} /> : '—'}</span></div>)}</div>{editableKeys && <form className="key-form" onSubmit={saveKey}><label>Provider<select value={keyProvider} onChange={event => { setKeyProvider(event.target.value); setKeyValue(''); setKeySecret(''); }}>{['higgsfield', 'google-ai-studio', 'freepik', 'vercel-ai-gateway'].map(id => <option key={id} value={id}>{providerNames[id]}</option>)}</select></label><label>{keyProvider === 'higgsfield' ? 'Key ID' : 'API key'}<input type="password" autoComplete="off" value={keyValue} onChange={event => setKeyValue(event.target.value)} placeholder={keyProvider === 'higgsfield' ? 'Paste Higgsfield Key ID' : 'Paste your provider API key'} minLength={8} maxLength={512} required /></label>{keyProvider === 'higgsfield' && <><label>Secret<input type="password" autoComplete="off" value={keySecret} onChange={event => setKeySecret(event.target.value)} placeholder="Paste Higgsfield Secret" minLength={8} maxLength={512} required /></label><a className="provider-key-link" href="https://open.higgsfield.ai/api-keys" target="_blank" rel="noopener noreferrer">Get Higgsfield credentials ↗</a><p className="control-note">One credential pair for the supported Higgsfield models. API balance is separate from a Higgsfield website subscription. Generation is charged by Higgsfield.</p></>}<button className="primary" disabled={savingKey || keyValue.length < 8 || (keyProvider === 'higgsfield' && keySecret.length < 8)}>{savingKey ? <Loader2 size={15} className="spin" /> : <KeyRound size={15} />}{savingKey ? 'Saving…' : keyProvider === 'higgsfield' ? 'Save Higgsfield credentials' : 'Save API key'}</button></form>}{keyProvider === 'higgsfield' && <div className="higgsfield-model-list"><strong>Image models</strong>{HIGGSFIELD_DEFINITIONS.filter(item => item.mediaType === 'image').map(item => <span key={item.id}>{item.label} · {providers.find(provider => provider.id === 'higgsfield')?.configured ? 'Credentials saved' : 'Locked'}</span>)}<strong>Video models</strong>{HIGGSFIELD_DEFINITIONS.filter(item => item.mediaType === 'video').map(item => <span key={item.id}>{item.label} · {providers.find(provider => provider.id === 'higgsfield')?.configured ? 'Credentials saved' : 'Locked'}</span>)}</div>}{connectionError && <p className="connection-error" role="alert">{connectionError}<button onClick={() => void loadProviders()}>Retry</button></p>}<p className="control-note">“Configured” confirms saved credentials, not validity, balance or model access. No paid verification runs automatically. Vertex AI and ToAPIs use server environment settings.</p></div>}
      {modal === 'project' && <form className="modal-content project-form" onSubmit={event => { event.preventDefault(); const name = projectName.trim(); if (!name) return; setBoards(current => [{ id: crypto.randomUUID(), name, created: new Date().toISOString() }, ...current]); setProjectName(''); setModal(null); setToast('Project board created.'); }}><span className="eyebrow">GREAT STORIES START HERE</span><h2>A space for your next idea.</h2><label>Project name<input value={projectName} onChange={event => setProjectName(event.target.value)} maxLength={80} placeholder="e.g. The desert campaign" required /></label><button className="primary" disabled={!projectName.trim()}>Create project <Plus size={15} /></button></form>}
      {modal === 'help' && <div className="modal-content"><Mark /><span className="eyebrow">CINQRA / STUDIO GUIDE</span><h2>From idea to final frame.</h2><ol className="guide-steps"><li><strong>Connect a provider</strong><p>Add Higgsfield Key ID and Secret, or connect another supported provider.</p></li><li><strong>Find your starting point</strong><p>Choose a recipe, build a cinematic shot, or write your own prompt.</p></li><li><strong>Choose the right model</strong><p>Match the model’s provider to your configured key. Review inputs and provider pricing before generating.</p></li><li><strong>Make it yours</strong><p>Generated images and videos appear in history, ready to preview and download.</p></li></ol><p className="control-note">CINQRA is an independent studio built on MIT-licensed Open-Higgsfield. It is not affiliated with Higgsfield. Proprietary effects, social feeds, accounts and billing are not replicated.</p><button className="primary" onClick={() => { setModal('connections'); }}>Set up providers <ArrowRight size={15} /></button></div>}
    </section></div>}
  </div>;
}
