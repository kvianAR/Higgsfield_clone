import { constants } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, rename, lstat } from 'node:fs/promises';
import path from 'node:path';
import { STORAGE_ROOT } from './storage-paths';

const directory = path.join(STORAGE_ROOT, '.cinqra-reliability');
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const names: Record<string, string[]> = {
    higgsfield: ['HF_API_KEY_ID', 'HF_API_KEY_SECRET'],
    google: ['GEMINI_API_KEY'],
    freepik: ['FREEPIK_API_KEY'],
};
function credentials(provider: string) {
    if (!names[provider]) throw new Error('ERR_PROVIDER');
    return names[provider].map(name => process.env[name] || (name === 'GEMINI_API_KEY' ? process.env.GOOGLE_AI_API_KEY : '') || '');
}
async function read<T>(key: string): Promise<T | null> {
    try {
        const file = await open(path.join(directory, hash(key) + '.json'), constants.O_RDONLY | constants.O_NOFOLLOW);
        try { return JSON.parse(await file.readFile('utf8')); } finally { await file.close(); }
    } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
}
async function save(key: string, value: unknown) {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    if ((await lstat(directory)).isSymbolicLink()) throw new Error('ERR_STORAGE');
    const temporary = path.join(directory, randomUUID() + '.tmp');
    const file = await open(temporary, 'wx', 0o600);
    try { await file.writeFile(JSON.stringify(value)); await file.sync(); } finally { await file.close(); }
    await rename(temporary, path.join(directory, hash(key) + '.json'));
}
export async function providerHealth() {
    return Promise.all(Object.keys(names).map(async provider => {
        const values = credentials(provider);
        const saved = await read<{ fingerprint: string; status: string; checkedAt: string; detail: string }>('health-' + provider);
        const configured = values.every(Boolean);
        const current = configured && saved?.fingerprint === hash(values.join(':'));
        return { provider, configured, status: current ? saved.status : configured ? 'saved' : 'missing', checkedAt: current ? saved.checkedAt : null, detail: current ? saved.detail : configured ? 'Credentials saved. Run a connection check or a reviewed generation.' : 'Add credentials in Connect API.' };
    }));
}
export async function recordProviderHealth(provider: string, status: string, detail: string) {
    const values = credentials(provider);
    await save('health-' + provider, { fingerprint: hash(values.join(':')), status, detail, checkedAt: new Date().toISOString() });
}
export async function checkProvider(provider: string) {
    const values = credentials(provider);
    if (!values.every(Boolean)) throw new Error('ERR_PROVIDER_KEY_MISSING');
    if (provider === 'freepik') {
        await recordProviderHealth(provider, 'saved', 'Run a reviewed Lipsync generation to verify model access. No free account-check endpoint is configured.');
        return providerHealth();
    }
    const response = await fetch(provider === 'google' ? 'https://generativelanguage.googleapis.com/v1beta/models' : 'https://api.higgsfield.ai/files/generate-upload-url', {
        method: provider === 'google' ? 'GET' : 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
        headers: provider === 'google' ? { 'x-goog-api-key': values[0] } : { Authorization: `Key ${values.join(':')}`, 'Content-Type': 'application/json' },
        ...(provider === 'higgsfield' ? { body: JSON.stringify({ content_type: 'image/png' }) } : {}),
    });
    const payload = await response.json().catch(() => null);
    const validResponse = response.ok && (provider === 'google' ? Array.isArray(payload?.models) : typeof payload?.upload_url === 'string' && typeof payload?.public_url === 'string');
    const invalidGoogleKey = payload?.error?.details?.some((item: { reason?: string }) => item.reason === 'API_KEY_INVALID');
    const status = validResponse ? 'connection_verified' : response.status === 401 || invalidGoogleKey ? 'invalid_key' : response.status === 402 ? 'balance_issue' : response.status === 403 ? 'access_issue' : response.status === 429 ? 'rate_limited' : 'check_failed';
    await recordProviderHealth(provider, status, validResponse ? 'Authenticated API request succeeded. Model access and generation still require a generation test.' : `Provider returned HTTP ${response.status}.`);
    return providerHealth();
}

export type Rate = { workflowId: string; profile: string; normal: number; discounted: number; unit: 'image' | 'second' | 'request'; source: string; updatedAt: string };
export function priceProfile(input: Record<string, unknown>) {
    const relevant = Object.fromEntries(Object.entries(input).filter(([key]) => !/^(prompt|text|image_url|image_urls|video_url|video_urls|audio_url|seed|duration|batch_size|num_images|language|target_audience|niche)$/.test(key)).sort(([a], [b]) => a.localeCompare(b)));
    return JSON.stringify(relevant);
}
export async function priceQuote(workflowId: string, input: Record<string, unknown>) {
    const profile = priceProfile(input);
    const rate = await read<Rate>('rate-' + workflowId + profile);
    const quantity = rate?.unit === 'second' ? Number(input.duration) * Number(input.batch_size ?? 1) : rate?.unit === 'request' ? 1 : Number(input.batch_size ?? input.num_images ?? 1);
    const valid = rate && Number.isFinite(quantity) && quantity > 0;
    return { rate, profile, quantity: valid ? quantity : null, normalTotal: valid ? quantity * rate.normal : null, discountedTotal: valid ? quantity * rate.discounted : null, currency: 'USD', basis: 'user-confirmed-rate', note: 'Estimate based on your saved rate for these settings. Provider billing is final.' };
}
export async function saveRate(input: Record<string, unknown>) {
    if (typeof input.workflowId !== 'string' || input.workflowId.length > 200 || typeof input.profile !== 'string' || input.profile.length > 16000 || !['image','second','request'].includes(String(input.unit)) || ![input.normal, input.discounted].every(value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 10000) || Number(input.discounted) > Number(input.normal)) throw new Error('ERR_RATE_INPUT');
    const url = new URL(String(input.source));
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error('ERR_RATE_SOURCE');
    const rate = { ...input, source: url.href, updatedAt: new Date().toISOString() };
    await save('rate-' + input.workflowId + input.profile, rate);
    return rate;
}
