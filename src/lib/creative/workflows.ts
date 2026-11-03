import pinned from './workflows-schemas.json';

export type WorkflowCategory = 'image' | 'video' | 'lipsync' | 'audio' | 'marketing' | 'motion';
export interface InputSchema { type?: string | string[]; title?: string; description?: string; properties?: Record<string, InputSchema>; required?: string[]; items?: InputSchema; enum?: unknown[]; const?: unknown; default?: unknown; format?: string; minimum?: number; maximum?: number; minLength?: number; maxLength?: number; minItems?: number; maxItems?: number; additionalProperties?: boolean; anyOf?: InputSchema[]; allOf?:InputSchema[]; if?:InputSchema; then?:InputSchema; else?:InputSchema; not?:InputSchema; $ref?: string }
export interface CreativeField { id: string; label: string; type: 'text'|'textarea'|'number'|'select'|'boolean'|'image'|'video'|'audio'|'images'; required?: boolean; default?: unknown; options?: unknown[]; description?: string }
export interface CreativeWorkflow { id: string; label: string; category: WorkflowCategory; description: string; available: boolean; reason?: string; provider: 'higgsfield'|'google'|'freepik'; fields: CreativeField[]; documentation: string; endpoint?: string; schema?: InputSchema; mode?: string }

function category(id: string): WorkflowCategory {
    if (/marketing|ads-studio/.test(id)) return 'marketing';
    if (/genjutsu|motion-control/.test(id)) return 'motion';
    if (/soul|ideogram|recraft|image-2|qwen-image|z-image|ai-influencer/.test(id)) return 'image';
    return 'video';
}
function field(id: string, schema: InputSchema, required: string[]): CreativeField {
    let type: CreativeField['type'] = schema.enum ? 'select' : schema.type === 'boolean' ? 'boolean' : /^(integer|number)$/.test(String(schema.type ?? '')) ? 'number' : id === 'prompt' ? 'textarea' : 'text';
    if (schema.type === 'array' && schema.items?.format === 'uri') type = 'images';
    else if (schema.format === 'uri') type = /video/.test(id) ? 'video' : /audio/.test(id) ? 'audio' : 'image';
    else if (schema.type === 'array' || schema.type === 'object') type = 'textarea';
    return { id, label: schema.title ?? id.replaceAll('_', ' '), type, required: required.includes(id), default: schema.default, options: schema.enum, description: schema.description ?? (schema.type === 'array' || schema.type === 'object' ? 'Enter JSON for this advanced input.' : undefined) };
}
const documented: CreativeWorkflow[] = (pinned as unknown as Array<{id:string;label:string;description:string;documentation:string;endpoint:string;schema:InputSchema}>).map(item => ({
    ...item, category: category(item.id), provider: 'higgsfield', available: !JSON.stringify(item.schema).includes('"$ref"'),
    reason: JSON.stringify(item.schema).includes('"$ref"') ? 'This model uses an unresolved schema reference; its adapter is not enabled.' : undefined,
    label: `${item.label} · ${item.id.split('/').filter(part => !['higgsfield','higgsfield-ai','kling-video','bytedance','alibaba'].includes(part)).join(' / ')}`,
    fields: Object.entries(item.schema.properties ?? {}).map(([id,schema]) => field(id,schema,item.schema.required ?? [])),
}));
const voice: CreativeField = { id:'voice',label:'Synthetic voice',type:'select',default:'Kore',options:['Kore','Puck','Charon','Fenrir','Aoede'] };
const audio: CreativeWorkflow[] = [
    { id:'audio-tts',label:'Voiceover',category:'audio',description:'Generate WAV speech from text using a selected synthetic Gemini voice.',available:true,provider:'google',mode:'tts',documentation:'https://ai.google.dev/gemini-api/docs/speech-generation',fields:[{id:'text',label:'Script and delivery instructions',type:'textarea',required:true},voice] },
    { id:'audio-voice-change',label:'Re-voice audio',category:'audio',description:'Transcribe audio and regenerate its words using a selected synthetic voice. Original timing and delivery are not preserved.',available:true,provider:'google',mode:'revoice',documentation:'https://ai.google.dev/gemini-api/docs/audio',fields:[{id:'audio_url',label:'Source audio',type:'audio',required:true},voice] },
    { id:'audio-translate',label:'Translate and dub',category:'audio',description:'Translate an automatically generated audio transcript and synthesize a WAV voice track. This does not synchronize lips or preserve original timing.',available:true,provider:'google',mode:'translate',documentation:'https://ai.google.dev/gemini-api/docs/audio',fields:[{id:'audio_url',label:'Source audio',type:'audio',required:true},{id:'language',label:'Target language',type:'text',required:true,default:'Hindi'},voice] },
];
const lipsync:CreativeWorkflow={id:'omnihuman-lipsync',label:'OmniHuman 1.5 · Talking character',category:'lipsync',description:'Animate a character image to match a supplied audio track through the existing Freepik OmniHuman adapter. Requires public reference URLs and a Freepik API key.',available:true,provider:'freepik',documentation:'https://docs.freepik.com',fields:[{id:'image_url',label:'Public character image URL',type:'image',required:true},{id:'audio_url',label:'Public audio track URL',type:'audio',required:true},{id:'resolution',label:'Resolution',type:'select',default:'720p',options:['720p','1080p']},{id:'turbo_mode',label:'Turbo mode',type:'boolean',default:false}],schema:{type:'object',required:['image_url','audio_url'],properties:{image_url:{type:'string',format:'uri',minLength:1,maxLength:8192},audio_url:{type:'string',format:'uri',minLength:1,maxLength:8192},resolution:{type:'string',enum:['720p','1080p'],default:'720p'},turbo_mode:{type:'boolean',default:false}}}};
const unavailable: CreativeWorkflow[] = [
    ['inpaint','Masked AI inpaint','image','A documented mask-input adapter is not available in the pinned Higgsfield API catalog. Local mask editing remains available.'],
    ['background-removal','AI background removal','image','No dedicated background-removal endpoint was verified in the current Higgsfield API catalog.'],
    ['layers-decompose','AI layer decomposition','image','Higgsfield website Layers is not exposed by a verified endpoint in this integration.'],
    ['video-upscale','AI video upscale','video','No dedicated video-upscale API contract was verified.'],
    ['lipsync','Higgsfield Lipsync Studio','lipsync','No dedicated Higgsfield lipsync endpoint was verified in the public API catalog. Use the existing OmniHuman workflow with its own provider connection.'],
].map(([id,label,group,reason]) => ({id,label,category:group as WorkflowCategory,reason,description:reason,available:false,provider:'higgsfield',fields:[],documentation:'https://open.higgsfield.ai/explore'}));
export const CREATIVE_WORKFLOWS: CreativeWorkflow[] = [...documented,...audio,lipsync,...unavailable];
export function findCreativeWorkflow(id: string) { return CREATIVE_WORKFLOWS.find(item=>item.id===id); }
export function publicCreativeWorkflows() { return CREATIVE_WORKFLOWS.map(item=>({id:item.id,label:item.label,category:item.category,description:item.description,available:item.available,reason:item.reason,provider:item.provider,fields:item.fields,documentation:item.documentation})); }

function constraints(value:unknown,schema:InputSchema,key:string):void {
    if(schema.$ref)throw new Error(`ERR_CREATIVE_INPUT_${key}`);
    for(const condition of schema.allOf??[])constraints(value,condition,key);
    if(schema.not){let matches=true;try{constraints(value,schema.not,key);}catch{matches=false;}if(matches)throw new Error(`ERR_CREATIVE_INPUT_${key}`);}
    if(schema.if){let matches=true;try{constraints(value,schema.if,key);}catch{matches=false;}const selected=matches?schema.then:schema.else;if(selected)constraints(value,selected,key);}
    if(schema.const!==undefined&&value!==schema.const)throw new Error(`ERR_CREATIVE_INPUT_${key}`);
    if(schema.enum&&!schema.enum.includes(value))throw new Error(`ERR_CREATIVE_INPUT_${key}`);
    if(schema.type==='null'&&value!==null)throw new Error(`ERR_CREATIVE_INPUT_${key}`);
    if(Array.isArray(value)) {if(value.length<(schema.minItems??0)||value.length>(schema.maxItems??Infinity))throw new Error(`ERR_CREATIVE_INPUT_${key}`);}
    if(value&&typeof value==='object'&&!Array.isArray(value)) {
        const object=value as Record<string,unknown>;
        if((schema.required??[]).some(name=>object[name]===undefined))throw new Error(`ERR_CREATIVE_INPUT_${key}`);
        for(const [name,rule] of Object.entries(schema.properties??{}))if(object[name]!==undefined)constraints(object[name],rule,key);
    }
}

function validate(value: unknown, schema: InputSchema, key: string): unknown {
    constraints(value,schema,key);
    if(Array.isArray(schema.type)){for(const type of schema.type){try{return validate(value,{...schema,type},key);}catch{}}throw new Error(`ERR_CREATIVE_INPUT_${key}`);}
    if (schema.anyOf) {
        for (const option of schema.anyOf) { try { return validate(value, option,key); } catch {} }
        throw new Error(`ERR_CREATIVE_INPUT_${key}`);
    }
    if (schema.const !== undefined && value !== schema.const) throw new Error(`ERR_CREATIVE_INPUT_${key}`);
    if (schema.enum && !schema.enum.includes(value)) throw new Error(`ERR_CREATIVE_INPUT_${key}`);
    if (schema.type === 'string') {
        if (typeof value !== 'string' || value.length < (schema.minLength ?? 0) || value.length > Math.min(schema.maxLength ?? 16000,16000)) throw new Error(`ERR_CREATIVE_INPUT_${key}`);
        return value;
    }
    if (schema.type === 'number' || schema.type === 'integer') {
        if (typeof value !== 'number' || !Number.isFinite(value) || (schema.type==='integer' && !Number.isInteger(value)) || value<(schema.minimum??-Infinity) || value>(schema.maximum??Infinity)) throw new Error(`ERR_CREATIVE_INPUT_${key}`);
    } else if (schema.type==='boolean' && typeof value!=='boolean') throw new Error(`ERR_CREATIVE_INPUT_${key}`);
    else if (schema.type==='array') {
        if (!Array.isArray(value) || value.length<(schema.minItems??0) || value.length>Math.min(schema.maxItems??50,50)) throw new Error(`ERR_CREATIVE_INPUT_${key}`);
        return value.map(item=>validate(item,schema.items??{},key));
    } else if (schema.type==='object') {
        if (!value || typeof value!=='object' || Array.isArray(value)) throw new Error(`ERR_CREATIVE_INPUT_${key}`);
        const object=value as Record<string,unknown>;
        if ((schema.required??[]).some(name=>object[name]===undefined)) throw new Error(`ERR_CREATIVE_INPUT_${key}`);
        if (schema.additionalProperties===false && Object.keys(object).some(name=>!Object.hasOwn(schema.properties??{},name))) throw new Error(`ERR_CREATIVE_INPUT_${key}`);
        return Object.fromEntries(Object.entries(object).map(([name,item])=>[name,validate(item,schema.properties?.[name]??{},key)]));
    }
    return value;
}
export function validateCreativeInput(workflow: CreativeWorkflow, input: unknown): Record<string, unknown> {
    if (!input || typeof input!=='object' || Array.isArray(input)) throw new Error('ERR_CREATIVE_INPUT');
    const raw=input as Record<string,unknown>;
    const properties=workflow.schema?.properties ?? Object.fromEntries(workflow.fields.map(item=>[item.id,{type:'string',maxLength:item.id==='text'?12000:8192,enum:item.options,default:item.default}]));
    if (Object.keys(raw).some(key=>!Object.hasOwn(properties,key))) throw new Error('ERR_CREATIVE_UNKNOWN_INPUT');
    const required=workflow.schema?.required??workflow.fields.filter(item=>item.required).map(item=>item.id);
    const result:Record<string,unknown>={};
    for (const [key,schema] of Object.entries(properties)) {
        let value=raw[key]??schema.default;
        if(value===null && !required.includes(key))continue;
        if (value===undefined || value==='') { if(required.includes(key) && schema.default!=='') throw new Error(`ERR_CREATIVE_INPUT_${key}`); if(value===undefined)continue; }
        if (typeof value==='string' && (schema.type==='array'||schema.type==='object')) {
            try {value=JSON.parse(value);} catch {throw new Error(`ERR_CREATIVE_INPUT_${key}`);}
        }
        result[key]=validate(value,schema,key);
    }
    if(workflow.schema)constraints(result,workflow.schema,'CONDITIONAL');
    return result;
}
