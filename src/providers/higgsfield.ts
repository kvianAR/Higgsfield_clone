import { HIGGSFIELD_DEFINITIONS, HIGGSFIELD_INPUT_FIELDS, type HiggsfieldField } from '@/models/capabilities/higgsfield';
import { createProviderTransport, invalidProviderResponse, providerHttpError, providerObject, ProviderRequestError, publicMediaUrl } from './request-error';
import type { GenerationProvider, ProviderGenerationRequest, ProviderPollRequest, ProviderPollResult, ProviderSubmission, GeneratedAsset } from './types';

const ORIGIN = 'https://api.higgsfield.ai';
const REQUEST_ID = /^[A-Za-z0-9_-]{1,200}$/;
const CREDENTIAL = /^[A-Za-z0-9._~+/=-]{8,512}$/;
type Phase = 'submit' | 'poll';
interface Operation { requestId: string; statusUrl: string; model: string; mediaType: 'image' | 'video' }
export class HiggsfieldProvider implements GenerationProvider {
    readonly id = 'higgsfield' as const;
    private credentials() {
        const key = process.env.HF_API_KEY_ID;
        const secret = process.env.HF_API_KEY_SECRET;
        if (!key || !secret || !CREDENTIAL.test(key) || !CREDENTIAL.test(secret)) throw new ProviderRequestError('ERR_HIGGSFIELD_NOT_CONFIGURED');
        return `Key ${key}:${secret}`;
    }
    private async request(url: string, phase: Phase, signal?: AbortSignal, body?: unknown, idempotencyKey?: string) {
        const authorization = this.credentials();
        const transport = createProviderTransport('HIGGSFIELD', phase, signal);
        transport.assertActive();
        try {
            const response = await transport.fetch(url, { method: body === undefined ? 'GET' : 'POST', signal: transport.signal,
                headers: { Authorization: authorization, Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}) },
                ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
            if (!response.ok) throw providerHttpError('HIGGSFIELD', phase, response.status, response.headers.get('retry-after'));
            return providerObject(await response.json(), 'HIGGSFIELD', phase);
        } catch (error) { throw transport.classify(error); }
    }
    private statusUrl(value: unknown, requestId: string) {
        if (typeof value !== 'string') throw invalidProviderResponse('HIGGSFIELD', 'submit');
        let url: URL;
        try { url = new URL(value); } catch { throw invalidProviderResponse('HIGGSFIELD', 'submit'); }
        if (url.origin !== ORIGIN || url.username || url.password || url.search || url.hash || url.pathname !== `/requests/${requestId}/status`) throw invalidProviderResponse('HIGGSFIELD', 'submit');
        return url.href;
    }
    private assets(result: Record<string, unknown>, mediaType: 'image' | 'video', phase: Phase): GeneratedAsset[] {
        const values = mediaType === 'image' ? result.images : [result.video];
        if (!Array.isArray(values) || !values.length || values.length > 4) throw invalidProviderResponse('HIGGSFIELD', phase);
        return values.map(value => {
            const item = providerObject(value, 'HIGGSFIELD', phase);
            return { url: publicMediaUrl(item.url, 'ERR_HIGGSFIELD_OUTPUT') };
        });
    }
    async submit(request: ProviderGenerationRequest): Promise<ProviderSubmission> {
        const definition = HIGGSFIELD_DEFINITIONS.find(item => item.id === request.modelId && item.endpoint === request.providerModelId && item.mediaType === request.mediaType);
        if (!definition) throw new ProviderRequestError('ERR_HIGGSFIELD_UNSUPPORTED_MODEL');
        if (request.media.video || request.media.audio || request.media.elements?.length || Object.keys(request.media.images ?? {}).length) throw new ProviderRequestError('ERR_HIGGSFIELD_UNSUPPORTED_MEDIA');
        if (!request.params.prompt?.trim() || request.params.prompt.length > 2500) throw new ProviderRequestError('ERR_HIGGSFIELD_PROMPT');
        const fields = definition.schema.properties;
        const params = request.params;
        const supplied: Record<string, unknown> = {
            ...(params.field_values ?? {}), prompt: params.prompt.trim(),
            ...(params.duration ? { duration: Number(params.duration) } : {}),
            ...(params.aspect_ratio ? { aspect_ratio: params.aspect_ratio } : {}),
            ...(params.resolution ? { resolution: params.resolution } : {}),
            ...(params.seed === undefined ? {} : { seed: params.seed }),
            ...(params.negative_prompt ? { negative_prompt: params.negative_prompt } : {}),
            ...(params.cfg_scale === undefined ? {} : { cfg_scale: params.cfg_scale }),
        };
        const payload: Record<string, unknown> = {};
        for (const name of HIGGSFIELD_INPUT_FIELDS) {
            const field: HiggsfieldField | undefined = fields[name];
            if (!field) continue;
            const value = supplied[name] ?? field.default;
            if (value === undefined || value === null || value === '') continue;
            if ((field.enum && !field.enum.includes(value)) ||
                (field.type === 'boolean' && typeof value !== 'boolean') ||
                (field.type === 'string' && typeof value !== 'string') ||
                (field.type === 'integer' && !Number.isInteger(value)) ||
                ((field.type === 'number' || field.type === 'integer') && (typeof value !== 'number' || !Number.isFinite(value) || value < (field.minimum ?? -Infinity) || value > (field.maximum ?? Infinity)))) {
                throw new ProviderRequestError('ERR_HIGGSFIELD_PARAMETER');
            }
            payload[name] = value;
        }
        if (fields.batch_size) payload.batch_size = 1;
        if (fields.num_images) payload.num_images = 1;
        for (const required of definition.schema.required ?? []) if (!(required in payload)) throw new ProviderRequestError('ERR_HIGGSFIELD_PARAMETER');
        if (!request.clientTaskId || !REQUEST_ID.test(request.clientTaskId)) throw new ProviderRequestError('ERR_HIGGSFIELD_CLIENT_TASK_ID');
        const result = await this.request(`${ORIGIN}/${definition.endpoint}`, 'submit', request.signal, payload, request.clientTaskId);
        const id = result.request_id;
        if (typeof id !== 'string' || !REQUEST_ID.test(id)) throw invalidProviderResponse('HIGGSFIELD', 'submit');
        if (result.status === 'completed') return { status: 'COMPLETED', providerTaskId: id, assets: this.assets(result, request.mediaType, 'submit') };
        if (!['queued', 'in_progress'].includes(String(result.status))) throw invalidProviderResponse('HIGGSFIELD', 'submit');
        const operation: Operation = { requestId: id, statusUrl: this.statusUrl(result.status_url, id), model: definition.endpoint, mediaType: request.mediaType };
        return { status: result.status === 'queued' ? 'CREATED' : 'IN_PROGRESS', providerTaskId: id, operation };
    }
    async poll(request: ProviderPollRequest): Promise<ProviderPollResult> {
        const value = providerObject(request.operation, 'HIGGSFIELD', 'poll');
        const operation = value as unknown as Operation;
        if (typeof operation.requestId !== 'string' || !REQUEST_ID.test(operation.requestId) || operation.model !== request.providerModelId || operation.mediaType !== request.mediaType || !HIGGSFIELD_DEFINITIONS.some(item => item.endpoint === operation.model && item.mediaType === operation.mediaType)) throw new ProviderRequestError('ERR_HIGGSFIELD_OPERATION');
        // Validate persisted URLs again before attaching credentials to a polling request.
        const url = this.statusUrl(operation.statusUrl, operation.requestId);
        const result = await this.request(url, 'poll', request.signal);
        if (result.request_id !== operation.requestId) throw invalidProviderResponse('HIGGSFIELD', 'poll');
        if (['queued', 'in_progress'].includes(String(result.status))) return { status: result.status === 'queued' ? 'CREATED' : 'IN_PROGRESS', operation };
        if (result.status === 'completed') return { status: 'COMPLETED', assets: this.assets(result, request.mediaType, 'poll'), operation };
        if (['failed', 'nsfw', 'canceled'].includes(String(result.status))) return { status: result.status === 'canceled' ? 'CANCELLED' : 'FAILED', error: result.status === 'nsfw' ? 'ERR_HIGGSFIELD_MODERATION' : 'ERR_HIGGSFIELD_TASK_FAILED', operation };
        throw invalidProviderResponse('HIGGSFIELD', 'poll');
    }
}
