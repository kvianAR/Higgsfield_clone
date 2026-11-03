import definitions from './higgsfield-schemas.json';
import type { ModelCapabilities, CustomFieldCapability } from './types';
import type { ImageModelCapability } from './image';

export interface HiggsfieldField { type?: string; enum?: unknown[]; default?: unknown; minimum?: number; maximum?: number; minLength?: number; maxLength?: number; title?: string }
export interface HiggsfieldDefinition { id: string; label: string; mediaType: string; endpoint: string; documentation: string; schema: { properties: Record<string, HiggsfieldField>; required?: string[] } }
export const HIGGSFIELD_DEFINITIONS = definitions as unknown as HiggsfieldDefinition[];
export const HIGGSFIELD_INPUT_FIELDS = ['prompt', 'duration', 'aspect_ratio', 'resolution', 'seed', 'negative_prompt', 'generate_audio', 'enhance_prompt', 'prompt_optimizer', 'enable_thinking', 'aigc_watermark', 'cfg_scale'] as const;
function capabilities(definition: HiggsfieldDefinition): ImageModelCapability {
    const fields = definition.schema.properties;
    const ratioOptions = (fields.aspect_ratio?.enum ?? []).map(value => [String(value), String(value)] as [string, string]);
    const ratioDefault = String(fields.aspect_ratio?.default ?? ratioOptions[0]?.[1] ?? '');
    const duration = fields.duration;
    const durations = duration?.enum?.map(String) ?? (duration?.minimum !== undefined && duration.maximum !== undefined
        ? Array.from({ length: duration.maximum - duration.minimum + 1 }, (_, index) => String(duration.minimum! + index)) : []);
    const resolutions = fields.resolution?.enum?.map(String) ?? [];
    const custom: CustomFieldCapability[] = [];
    for (const name of HIGGSFIELD_INPUT_FIELDS) {
        const field = fields[name];
        if (!field || ['prompt', 'duration', 'aspect_ratio', 'resolution', 'negative_prompt', 'cfg_scale'].includes(name)) continue;
        if (field.type === 'boolean') custom.push({ id: name, label: field.title ?? name.replaceAll('_', ' '), type: 'checkbox', default: field.default ?? false });
        else if (name === 'seed') custom.push({ id: name, label: 'Seed', type: 'number', minimum: field.minimum, maximum: field.maximum });
    }
    if (definition.mediaType === 'image') {
        if (ratioOptions.length) custom.unshift({ id: 'aspect_ratio', label: 'Aspect ratio', type: 'select', options: ratioOptions.map(option => option[1]), default: ratioDefault });
    }
    if (resolutions.length) custom.unshift({ id: 'resolution', label: 'Resolution', type: 'select', options: resolutions, default: fields.resolution.default });
    return {
        id: definition.id, label: definition.label + ' · Higgsfield', family: definition.label, variant: 'Higgsfield API',
        group: 'Higgsfield', provider: 'higgsfield', provider_model_id: definition.endpoint,
        category: 'Generate', prompt_required: true, prompt_max: Math.min(fields.prompt?.maxLength ?? 2500, 2500),
        duration: durations.length ? { options: durations, default: String(duration.default ?? durations[0]) } : false,
        aspect_ratio: definition.mediaType === 'video' && ratioOptions.length ? { options: ratioOptions, default: [ratioDefault, ratioDefault] } : false,
        resolution_variant: false,
        size: false, negative_prompt: Boolean(fields.negative_prompt), cfg_scale: Boolean(fields.cfg_scale),
        style: false, shot_type: false, prompt_expansion: false, elements: false, media_slots: [], custom_fields: custom,
        has_edit_variant: false, sort_key: 20000,
    };
}
export const HIGGSFIELD_VIDEO_CAPABILITIES: Record<string, ModelCapabilities> = Object.fromEntries(HIGGSFIELD_DEFINITIONS.filter(item => item.mediaType === 'video').map(item => [item.id, capabilities(item)]));
export const HIGGSFIELD_IMAGE_CAPABILITIES: Record<string, ImageModelCapability> = Object.fromEntries(HIGGSFIELD_DEFINITIONS.filter(item => item.mediaType === 'image').map(item => [item.id, capabilities(item)]));
