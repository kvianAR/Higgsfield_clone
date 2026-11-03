import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createModuleLoader } from './test-module-loader.mjs';

test('Cost profiles preserve resolution/audio settings and separate normal/discount totals', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'cinqra-rate-'));
    try {
        const reliability = createModuleLoader({ env: { OPEN_HIGGSFIELD_STORAGE_DIR: directory } }).load('@/lib/studio-reliability');
        const input = { prompt: 'Scene', resolution: '1080p', generate_audio: true, duration: 5 };
        const profile = reliability.priceProfile(input);
        assert.notEqual(profile, reliability.priceProfile({ ...input, generate_audio: false }));
        assert.notEqual(profile, reliability.priceProfile({ ...input, resolution: '720p' }));
        await reliability.saveRate({ workflowId: 'test', profile, normal: 0.2, discounted: 0.1, unit: 'second', source: 'https://open.higgsfield.ai/pricing' });
        const quote = await reliability.priceQuote('test', input);
        assert.equal(quote.normalTotal, 1);
        assert.equal(quote.discountedTotal, 0.5);
        assert.equal((await reliability.priceQuote('test', { ...input, resolution: '720p' })).rate, null);
    } finally { await rm(directory, { recursive: true, force: true }); }
});
test('Connection status distinguishes configured from authenticated without sending key values to clients', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'cinqra-health-'));
    const key = 'synthetic-google-key';
    try {
        const env = { OPEN_HIGGSFIELD_STORAGE_DIR: directory, GEMINI_API_KEY: key };
        const reliability = createModuleLoader({ env, globals: { fetch: async () => new Response('{"models":[]}', { status: 200 }) } }).load('@/lib/studio-reliability');
        assert.equal((await reliability.providerHealth()).find(item => item.provider === 'google').status, 'saved');
        const health = await reliability.checkProvider('google');
        assert.equal(health.find(item => item.provider === 'google').status, 'connection_verified');
        assert.equal(JSON.stringify(health).includes(key), false);
    } finally { await rm(directory, { recursive: true, force: true }); }
});
