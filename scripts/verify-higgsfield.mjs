import assert from 'node:assert/strict';
import test from 'node:test';
import { createModuleLoader } from './test-module-loader.mjs';
const key = 'synthetic-hf-key';
const secret = 'synthetic-hf-secret';
const id = '00000000-0000-4000-8000-000000000001';
const origin = 'https://api.higgsfield.ai';
const statusUrl = `${origin}/requests/${id}/status`;
const media = 'https://fixtures.example.test/output.mp4';
const json = (value, status = 200, headers = {}) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json', ...headers } });
function fixture(handler, env = { HF_API_KEY_ID: key, HF_API_KEY_SECRET: secret }) {
    const calls = [];
    const modules = createModuleLoader({ env, globals: { fetch: async (url, init) => { calls.push({ url, ...init }); return handler?.(url, init) ?? json({ status: 'queued', request_id: id, status_url: statusUrl }); } } });
    const provider = new (modules.load('src/providers/higgsfield.ts').HiggsfieldProvider)();
    const definitions = modules.load('src/models/capabilities/higgsfield.ts').HIGGSFIELD_DEFINITIONS;
    return { ...modules, provider, calls, definitions };
}
function request(definition, params = {}) {
    return { modelId: definition.id, providerModelId: definition.endpoint, mediaType: definition.mediaType, capabilities: {}, params: { model_id: definition.id, prompt: 'Synthetic test scene', ...params }, media: {}, clientTaskId: id };
}
function polling(definition) { return { mediaType: definition.mediaType, providerModelId: definition.endpoint, operation: { requestId: id, statusUrl, model: definition.endpoint, mediaType: definition.mediaType } }; }
test('every advertised Higgsfield model submits supported defaults with server credentials and idempotency', async () => {
    const f = fixture();
    assert.equal(f.definitions.length, 7);
    for (const definition of f.definitions) {
        const result = await f.provider.submit(request(definition));
        assert.equal(result.status, 'CREATED');
        const call = f.calls.at(-1);
        assert.equal(call.url, `${origin}/${definition.endpoint}`);
        assert.equal(call.headers.Authorization, `Key ${key}:${secret}`);
        assert.equal(call.headers['Idempotency-Key'], id);
        assert.equal(call.redirect, 'error');
        assert.ok(call.signal instanceof AbortSignal);
        const body = JSON.parse(call.body);
        for (const required of definition.schema.required ?? []) assert.ok(required in body);
        for (const field of Object.keys(body)) assert.ok(field in definition.schema.properties, field);
        assert.equal(body.batch_size, definition.schema.properties.batch_size ? 1 : undefined);
        assert.equal(JSON.stringify(result).includes(secret), false);
        assert.equal(JSON.stringify(result.operation).includes(key), false);
        const catalog = f.load(`src/models/capabilities/${definition.mediaType}.ts`)[definition.mediaType === 'image' ? 'IMAGE_CAPABILITIES' : 'VIDEO_CAPABILITIES'];
        assert.equal(catalog[definition.id].provider, 'higgsfield');
        assert.equal(catalog[definition.id].provider_model_id, definition.endpoint);
    }
});
test('Higgsfield maps polling statuses and image/video outputs without credential persistence', async () => {
    for (const status of ['queued', 'in_progress', 'completed', 'failed', 'nsfw', 'canceled']) {
        const f = fixture(() => json({ request_id: id, status, images: [{ url: 'https://fixtures.example.test/image.png' }], video: { url: media }, error: `do not expose ${secret}` }));
        for (const definition of [f.definitions[0], f.definitions.find(item => item.mediaType === 'video')]) {
            const result = await f.provider.poll(polling(definition));
            const expected = { queued: 'CREATED', in_progress: 'IN_PROGRESS', completed: 'COMPLETED', failed: 'FAILED', nsfw: 'FAILED', canceled: 'CANCELLED' }[status];
            assert.equal(result.status, expected);
            if (status === 'completed') assert.equal(result.assets.length, 1);
            assert.equal(JSON.stringify(result).includes(secret), false);
        }
    }
});
test('Higgsfield refuses missing credentials, invalid controls and media before network submission', async () => {
    const missing = fixture(undefined, { HF_API_KEY_ID: key });
    await assert.rejects(missing.provider.submit(request(missing.definitions[0])), /ERR_HIGGSFIELD_NOT_CONFIGURED/);
    assert.equal(missing.calls.length, 0);
    const f = fixture(); const video = f.definitions.find(item => item.mediaType === 'video');
    for (const params of [{ duration: '999' }, { resolution: 'unknown' }, { aspect_ratio: 'bad' }, { prompt: '' }, { field_values: { generate_audio: 'yes' } }]) {
        await assert.rejects(f.provider.submit(request(video, params)), /ERR_HIGGSFIELD_(PARAMETER|PROMPT)/);
    }
    await assert.rejects(f.provider.submit({ ...request(video), media: { images: { first_frame: media } } }), /ERR_HIGGSFIELD_UNSUPPORTED_MEDIA/);
    assert.equal(f.calls.length, 0);
});
test('Higgsfield validates status origins and request identity before exposing results', async () => {
    const f = fixture(); const definition = f.definitions[0];
    for (const statusUrl of ['https://evil.example/steal', `${origin}/requests/another/status`, `${origin}/requests/${id}/status?key=bad`]) {
        await assert.rejects(f.provider.poll({ ...polling(definition), operation: { ...polling(definition).operation, statusUrl } }), /ERR_HIGGSFIELD_RESPONSE/);
    }
    assert.equal(f.calls.length, 0);
    const mismatch = fixture(() => json({ status: 'completed', request_id: 'another', images: [{ url: media }] }));
    await assert.rejects(mismatch.provider.poll(polling(mismatch.definitions[0])), /ERR_HIGGSFIELD_RESPONSE/);
});
test('Higgsfield rejects untrusted submission status URLs and invalid completed media', async () => {
    for (const handler of [() => json({ status: 'queued', request_id: id, status_url: 'https://evil.example/status' }), () => json({ status: 'completed', request_id: id, images: [{ url: 'http://127.0.0.1/private' }] })]) {
        const f = fixture(handler);
        await assert.rejects(f.provider.submit(request(f.definitions[0])), error => { assert.match(error.message, /^ERR_HIGGSFIELD_/); return true; });
    }
});
test('Higgsfield preserves uncertain paid submission semantics and never retries automatically', async () => {
    const network = fixture(() => { throw new Error(`timeout with ${secret}`); });
    await assert.rejects(network.provider.submit(request(network.definitions[0])), error => { assert.equal(error.submissionUncertain, true); assert.equal(error.retryable, false); assert.equal(error.message.includes(secret), false); return true; });
    assert.equal(network.calls.length, 1);
    for (const status of [401, 402, 403, 422, 429, 503]) {
        const f = fixture(() => json({ detail: secret }, status, { 'retry-after': '2' }));
        await assert.rejects(f.provider.submit(request(f.definitions[0])), error => { assert.equal(error.code, `ERR_HIGGSFIELD_HTTP_${status}`); assert.equal(error.submissionUncertain, status >= 500); assert.equal(error.message.includes(secret), false); return true; });
        assert.equal(f.calls.length, 1);
    }
});

test('Higgsfield selectable resolutions and durations reach their documented request fields', async () => {
    const f = fixture();
    for (const definition of f.definitions) {
        const properties = definition.schema.properties;
        for (const resolution of properties.resolution?.enum ?? [undefined]) {
            const durationField = properties.duration;
            const durations = durationField?.enum ?? (durationField ? [durationField.minimum, durationField.maximum] : [undefined]);
            for (const duration of durations) {
                await f.provider.submit(request(definition, { ...(duration === undefined ? {} : { duration: String(duration) }), field_values: { ...(resolution === undefined ? {} : { resolution }) } }));
                const body = JSON.parse(f.calls.at(-1).body);
                if (duration !== undefined) assert.equal(body.duration, duration);
                if (resolution !== undefined) assert.equal(body.resolution, resolution);
            }
        }
    }
});
