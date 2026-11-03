'use client';
import { useEffect, useState } from 'react';

type Health = { provider: string; configured: boolean; status: string; checkedAt?: string; detail: string };
type Quote = { profile: string; quantity: number | null; normalTotal: number | null; discountedTotal: number | null; note: string; rate?: { normal: number; discounted: number; unit: string; source: string; updatedAt: string } };
async function call(body?: unknown) {
    const response = await fetch('/api/studio-reliability', body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : undefined);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Connection request failed');
    return data;
}
export function ProviderHealth() {
    const [providers, setProviders] = useState<Health[]>([]);
    const [message, setMessage] = useState('');
    const [busy, setBusy] = useState(false);
    useEffect(() => { let active = true; const load = () => { void call().then(data => { if (active) setProviders(data.providers); }).catch(error => { if (active) setMessage(error.message); }); }; load(); window.addEventListener('cinqra:connections-updated', load); return () => { active = false; window.removeEventListener('cinqra:connections-updated', load); }; }, []);
    return <section className="creative-card"><h3>Connection and generation checks</h3>{providers.map(provider => <article key={provider.provider} style={{ marginBottom: 14 }}><strong>{provider.provider} · {provider.status.replaceAll('_', ' ')}</strong><p>{provider.detail}</p>{provider.checkedAt && <small>Checked {new Date(provider.checkedAt).toLocaleString()}</small>}<button disabled={busy || !provider.configured} onClick={async () => { setBusy(true); try { const data = await call({ action: 'check', provider: provider.provider }); setProviders(data.providers); setMessage('Connection check finished.'); } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); } }}>Check connection</button></article>)}<p role="status">{message}</p><p>To verify a real output, choose a workflow, review its cost and submit one generation. Successful completed jobs record the provider’s generation status.</p></section>;
}
export function CostPreview({ workflowId, input, provider = 'higgsfield' }: { workflowId: string; input: Record<string, unknown>; provider?: string }) {
    const [quote, setQuote] = useState<Quote | null>(null);
    const [quoteKey, setQuoteKey] = useState('');
    const [message, setMessage] = useState('');
    const fingerprint = JSON.stringify(input);
    useEffect(() => { let active = true; const timer = setTimeout(() => { void call({ action: 'quote', workflowId, input: JSON.parse(fingerprint) }).then(data => { if (active) { setQuote(data); setQuoteKey(workflowId + fingerprint); } }).catch(error => { if (active) setMessage(error.message); }); }, 250); return () => { active = false; clearTimeout(timer); }; }, [workflowId, fingerprint]);
    const sourceUrl = provider === 'google' || provider === 'google-ai-studio' ? 'https://ai.google.dev/gemini-api/docs/pricing' : provider === 'freepik' ? 'https://www.freepik.com/api/pricing' : 'https://open.higgsfield.ai/pricing';
    const ready = quoteKey === workflowId + fingerprint;
    return <section style={{ padding: 16, border: '1px solid #bca0dd44', borderRadius: 9 }}><h3>Cost before generation</h3>{ready && quote?.normalTotal !== null && quote?.normalTotal !== undefined ? <><p>Without discount ${quote.normalTotal.toFixed(4)} USD</p><p>With your saved discount ${quote.discountedTotal?.toFixed(4)} USD</p><small>{quote.note} Rate checked {quote.rate?.updatedAt && new Date(quote.rate.updatedAt).toLocaleDateString()}.</small></> : <p>Exact cost is unavailable. Confirm the current rate and selected settings on the provider’s pricing page.</p>}<details><summary>Set rate for these settings</summary><form key={workflowId + quote?.profile} onSubmit={async event => { event.preventDefault(); if (!ready) { setMessage('Wait for the current pricing settings to load.'); return; } const data = new FormData(event.currentTarget); try { await call({ action: 'rate', workflowId, profile: quote?.profile ?? '{}', normal: Number(data.get('normal')), discounted: Number(data.get('discounted')), unit: data.get('unit'), source: data.get('source') }); setQuote(await call({ action: 'quote', workflowId, input })); setMessage('Rate saved for these settings.'); } catch (error) { setMessage((error as Error).message); } }}><label>Normal USD per unit<input name="normal" type="number" step="0.000001" min="0" required defaultValue={quote?.rate?.normal} /></label><label>Discounted USD per unit<input name="discounted" type="number" step="0.000001" min="0" required defaultValue={quote?.rate?.discounted} /></label><label>Billing unit<select name="unit" defaultValue={quote?.rate?.unit ?? 'second'}><option value="second">Per output second</option><option value="image">Per output image</option><option value="request">Per request</option></select></label><label>Official pricing source<input name="source" type="url" required defaultValue={quote?.rate?.source ?? sourceUrl} /></label><button disabled={!ready}>Save confirmed rate</button></form></details><p role="status">{message}</p></section>;
}
