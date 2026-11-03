import { publicMediaUrl } from '@/providers/request-error';
import { fetchRemoteMedia } from '@/lib/media-transfer';
import { resolveSafeRemoteUrl } from '@/lib/safe-url';
import type { CreativeWorkflow, InputSchema } from './workflows';

export type CreativeOutput = { url: string; mimeType?: string };
export type ProviderResult = { status:'queued'|'in_progress'|'completed'|'failed'|'cancelled'; requestId?:string; statusUrl?:string; outputs?:CreativeOutput[]; error?:string };
export type ProviderContext = { env:NodeJS.ProcessEnv; fetch:typeof fetch; readAsset?:(url:string)=>Promise<{data:Buffer;mimeType:string}>; saveAudio:(data:Buffer)=>Promise<string> };
const ORIGIN='https://api.higgsfield.ai';
const ID=/^[A-Za-z0-9_-]{1,200}$/;
function credential(env:NodeJS.ProcessEnv) {
    const key=env.HF_API_KEY_ID,secret=env.HF_API_KEY_SECRET;
    if(!key||!secret||![key,secret].every(value=>/^[A-Za-z0-9._~+/=-]{8,512}$/.test(value)))throw new Error('ERR_HIGGSFIELD_NOT_CONFIGURED');
    return `Key ${key}:${secret}`;
}
async function jsonRequest(context:ProviderContext,url:string,init:RequestInit,timeout=45000) {
    let response:Response;
    try {response=await context.fetch(url,{...init,redirect:'error',signal:AbortSignal.timeout(timeout)});}catch{throw new Error('ERR_CREATIVE_NETWORK_UNCERTAIN');}
    if(!response.ok)throw new Error(`ERR_CREATIVE_PROVIDER_HTTP_${response.status}`);
    if(Number(response.headers.get('content-length')??0)>4*1024*1024)throw new Error('ERR_CREATIVE_PROVIDER_RESPONSE');
    let value:unknown;
    try {value=await response.json();}catch{throw new Error('ERR_CREATIVE_PROVIDER_RESPONSE');}
    if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('ERR_CREATIVE_PROVIDER_RESPONSE');
    return value as Record<string,unknown>;
}
function safeStatus(value:unknown,id:string) {
    if(typeof value!=='string'||!ID.test(id))throw new Error('ERR_CREATIVE_STATUS_URL');
    let url:URL;try{url=new URL(value);}catch{throw new Error('ERR_CREATIVE_STATUS_URL');}
    if(url.origin!==ORIGIN||url.pathname!==`/requests/${id}/status`||url.search||url.hash||url.username||url.password)throw new Error('ERR_CREATIVE_STATUS_URL');
    return url.href;
}
function parseResult(result:Record<string,unknown>,expectedId?:string):ProviderResult {
    const id=result.request_id;
    if(typeof id!=='string'||!ID.test(id)||(expectedId&&expectedId!==id))throw new Error('ERR_CREATIVE_REQUEST_ID');
    if(result.status==='queued'||result.status==='in_progress')return {status:result.status,requestId:id,statusUrl:safeStatus(result.status_url??`${ORIGIN}/requests/${id}/status`,id)};
    if(result.status==='failed'||result.status==='nsfw'||result.status==='canceled')return {status:result.status==='canceled'?'cancelled':'failed',requestId:id,error:result.status==='nsfw'?'ERR_CREATIVE_MODERATION':'ERR_CREATIVE_GENERATION_FAILED'};
    if(result.status!=='completed')throw new Error('ERR_CREATIVE_PROVIDER_RESPONSE');
    const values:unknown[]=[];
    for(const key of ['images','videos','audios'])if(Array.isArray(result[key]))values.push(...result[key] as unknown[]);
    for(const key of ['image','video','audio'])if(result[key])values.push(result[key]);
    const outputs=values.map(value=>{
        if(!value||typeof value!=='object'||typeof (value as {url?:unknown}).url!=='string')throw new Error('ERR_CREATIVE_PROVIDER_RESPONSE');
        return {url:publicMediaUrl((value as {url:string}).url,'ERR_CREATIVE_OUTPUT_URL')};
    });
    if(!outputs.length||outputs.length>16)throw new Error('ERR_CREATIVE_PROVIDER_RESPONSE');
    return {status:'completed',requestId:id,outputs};
}
export async function readCreativeMedia(context:ProviderContext,value:string) {
    if(value.startsWith('/')) {
        if(!context.readAsset)throw new Error('ERR_CREATIVE_PUBLIC_MEDIA_URL_REQUIRED');
        return context.readAsset(value);
    }
    return fetchRemoteMedia(value,{maxBytes:32*1024*1024});
}
async function uploadLocal(context:ProviderContext,value:string):Promise<string> {
    if(!value.startsWith('/')) {await resolveSafeRemoteUrl(value);return value;}
    const asset=await readCreativeMedia(context,value);
    if(!['image/jpeg','image/png','image/webp','image/gif','audio/wav','video/mp4'].includes(asset.mimeType))throw new Error('ERR_CREATIVE_HIGGSFIELD_UPLOAD_TYPE');
    const upload=await jsonRequest(context,`${ORIGIN}/files/generate-upload-url`,{method:'POST',headers:{Authorization:credential(context.env),'Content-Type':'application/json'},body:JSON.stringify({content_type:asset.mimeType})});
    const uploadUrl=publicMediaUrl(upload.upload_url,'ERR_CREATIVE_UPLOAD_URL');
    await resolveSafeRemoteUrl(uploadUrl);
    const publicUrl=publicMediaUrl(upload.public_url,'ERR_CREATIVE_UPLOAD_URL');
    if(!upload.upload_headers||typeof upload.upload_headers!=='object'||Array.isArray(upload.upload_headers))throw new Error('ERR_CREATIVE_UPLOAD_HEADERS');
    const headers:Record<string,string>={};
    for(const [key,val] of Object.entries(upload.upload_headers)) {
        if(typeof val!=='string'||!/^[!#$%&'*+.^_`|~\w-]+$/.test(key)||/[\r\n]/.test(val)||['authorization','cookie','host'].includes(key.toLowerCase()))throw new Error('ERR_CREATIVE_UPLOAD_HEADERS');
        headers[key]=val;
    }
    let response:Response;
    try {response=await context.fetch(uploadUrl,{method:'PUT',headers,body:asset.data as BodyInit,redirect:'error',signal:AbortSignal.timeout(45000)});}catch{throw new Error('ERR_CREATIVE_UPLOAD_FAILED');}
    if(!response.ok)throw new Error('ERR_CREATIVE_UPLOAD_FAILED');
    return publicUrl;
}
async function prepare(context:ProviderContext,value:unknown,schema:InputSchema):Promise<unknown> {
    if(schema.format==='uri'&&typeof value==='string')return uploadLocal(context,value);
    if(Array.isArray(value))return Promise.all(value.map(item=>prepare(context,item,schema.items??{})));
    if(value&&typeof value==='object')return Object.fromEntries(await Promise.all(Object.entries(value).map(async([key,item])=>[key,await prepare(context,item,schema.properties?.[key]??{})])));
    return value;
}
export async function submitHiggsfield(context:ProviderContext,workflow:CreativeWorkflow,input:Record<string,unknown>,id:string):Promise<ProviderResult> {
    if(!workflow.endpoint||!ID.test(id))throw new Error('ERR_CREATIVE_WORKFLOW');
    const authorization=credential(context.env);
    const payload=await prepare(context,input,workflow.schema??{});
    return parseResult(await jsonRequest(context,`${ORIGIN}/${workflow.endpoint}`,{method:'POST',headers:{Authorization:authorization,'Content-Type':'application/json','Idempotency-Key':id},body:JSON.stringify(payload)}));
}
export async function pollHiggsfield(context:ProviderContext,id:string,url:string):Promise<ProviderResult> {
    return parseResult(await jsonRequest(context,safeStatus(url,id),{method:'GET',headers:{Authorization:credential(context.env)}},15000),id);
}
export async function submitFreepik(context:ProviderContext,input:Record<string,unknown>):Promise<ProviderResult> {
    if(!context.env.FREEPIK_API_KEY)throw new Error('ERR_FREEPIK_NOT_CONFIGURED');
    for(const key of ['image_url','audio_url']) {
        if(String(input[key]).startsWith('/'))throw new Error('ERR_CREATIVE_FREEPIK_PUBLIC_MEDIA_REQUIRED');
        await resolveSafeRemoteUrl(String(input[key]));
    }
    const response=await jsonRequest(context,'https://api.freepik.com/v1/ai/video/omni-human-1-5',{method:'POST',headers:{'x-freepik-api-key':context.env.FREEPIK_API_KEY,'Content-Type':'application/json'},body:JSON.stringify(input)});
    const data=(response.data??response) as Record<string,unknown>;
    if(typeof data.task_id!=='string'||!ID.test(data.task_id))throw new Error('ERR_CREATIVE_PROVIDER_RESPONSE');
    return {status:'queued',requestId:data.task_id,statusUrl:`https://api.freepik.com/v1/ai/video/omni-human-1-5/${data.task_id}`};
}
export async function pollFreepik(context:ProviderContext,id:string,url:string):Promise<ProviderResult> {
    if(!context.env.FREEPIK_API_KEY)throw new Error('ERR_FREEPIK_NOT_CONFIGURED');
    if(!ID.test(id)||url!==`https://api.freepik.com/v1/ai/video/omni-human-1-5/${id}`)throw new Error('ERR_CREATIVE_STATUS_URL');
    const response=await jsonRequest(context,url,{method:'GET',headers:{'x-freepik-api-key':context.env.FREEPIK_API_KEY}},15000);
    const data=(response.data??response) as Record<string,unknown>;
    const status=String(data.status).toUpperCase();
    if(['CREATED','QUEUED','PENDING','IN_PROGRESS'].includes(status))return {status:'in_progress',requestId:id,statusUrl:url};
    if(['FAILED','ERROR','CANCELLED','CANCELED'].includes(status))return {status:'failed',error:'ERR_CREATIVE_GENERATION_FAILED',requestId:id};
    const urls=typeof data.generated==='string'?[data.generated]:data.generated;
    if(status!=='COMPLETED'||!Array.isArray(urls)||!urls.length||urls.length>16)throw new Error('ERR_CREATIVE_PROVIDER_RESPONSE');
    return {status:'completed',requestId:id,outputs:urls.map(value=>({url:publicMediaUrl(value,'ERR_CREATIVE_OUTPUT_URL'),mimeType:'video/mp4'}))};
}
function googleKey(context:ProviderContext) {
    const key=context.env.GEMINI_API_KEY||context.env.GOOGLE_AI_API_KEY;
    if(!key)throw new Error('ERR_GOOGLE_NOT_CONFIGURED');
    return key;
}
async function google(context:ProviderContext,model:string,body:unknown) {
    if(!/^[a-z0-9.\-]{1,100}$/.test(model))throw new Error('ERR_CREATIVE_GOOGLE_MODEL');
    return jsonRequest(context,`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':googleKey(context)},body:JSON.stringify(body)},90000);
}
function parts(result:Record<string,unknown>):Array<{text?:string;inlineData?:{data?:string;mimeType?:string}}> {
    const candidates=result.candidates as Array<{content?:{parts?:Array<{text?:string;inlineData?:{data?:string;mimeType?:string}}>}}>;
    if(!Array.isArray(candidates)||!candidates[0]?.content?.parts)throw new Error('ERR_CREATIVE_GOOGLE_RESPONSE');
    return candidates[0].content.parts;
}
export async function runDirector(context:ProviderContext,brief:string,mode:'prompt'|'storyboard',extra='') {
    if(!brief.trim()||brief.length>12000||extra.length>12000)throw new Error('ERR_CREATIVE_DIRECTOR_INPUT');
    const prompt=mode==='storyboard'
        ? 'Plan 1 to 12 cinematic shots. Respond only as JSON {"text":"overall direction","shots":[{"title":"short name","prompt":"detailed generation prompt","duration":5}]}. Keep each duration between 1 and 30 seconds. Do not claim any generation was executed.'
        : 'Rewrite the user brief as one concrete, useful image/video generation prompt. Preserve their intent. Respond only with the improved prompt. Do not claim execution.';
    const result=await google(context,context.env.CINQRA_DIRECTOR_MODEL||'gemini-2.5-flash',{systemInstruction:{parts:[{text:prompt}]},contents:[{parts:[{text:`Brief:\n${brief}\nCreative context:\n${extra}`}]}],generationConfig:{maxOutputTokens:4096,...(mode==='storyboard'?{responseMimeType:'application/json'}:{})}});
    const text=parts(result).map(part=>part.text??'').join('').trim();
    if(!text||text.length>20000)throw new Error('ERR_CREATIVE_GOOGLE_RESPONSE');
    if(mode==='prompt')return {text};
    let parsed:unknown;try{parsed=JSON.parse(text);}catch{throw new Error('ERR_CREATIVE_DIRECTOR_RESPONSE');}
    const object=parsed as {text?:unknown;shots?:Array<{title?:unknown;prompt?:unknown;duration?:unknown}>};
    if(typeof object.text!=='string'||!Array.isArray(object.shots)||!object.shots.length||object.shots.length>12)throw new Error('ERR_CREATIVE_DIRECTOR_RESPONSE');
    const shots=object.shots.map(shot=>{
        if(typeof shot.title!=='string'||!shot.title||shot.title.length>200||typeof shot.prompt!=='string'||!shot.prompt||shot.prompt.length>4000||typeof shot.duration!=='number'||!Number.isInteger(shot.duration)||shot.duration<1||shot.duration>30)throw new Error('ERR_CREATIVE_DIRECTOR_RESPONSE');
        return {title:shot.title,prompt:shot.prompt,duration:shot.duration};
    });
    return {text:object.text,shots};
}
function pcmWave(pcm:Buffer) {
    if(!pcm.length||pcm.length>30*1024*1024||pcm.length%2)throw new Error('ERR_CREATIVE_AUDIO_RESPONSE');
    const header=Buffer.alloc(44);header.write('RIFF',0);header.writeUInt32LE(pcm.length+36,4);header.write('WAVEfmt ',8);header.writeUInt32LE(16,16);header.writeUInt16LE(1,20);header.writeUInt16LE(1,22);header.writeUInt32LE(24000,24);header.writeUInt32LE(48000,28);header.writeUInt16LE(2,32);header.writeUInt16LE(16,34);header.write('data',36);header.writeUInt32LE(pcm.length,40);return Buffer.concat([header,pcm]);
}
export async function generateGoogleAudio(context:ProviderContext,workflow:CreativeWorkflow,input:Record<string,unknown>):Promise<ProviderResult> {
    googleKey(context);
    let text=String(input.text??'');
    if(workflow.mode!=='tts') {
        const media=await readCreativeMedia(context,String(input.audio_url));
        if(!media.mimeType.startsWith('audio/'))throw new Error('ERR_CREATIVE_AUDIO_TYPE');
        const instruction=workflow.mode==='translate'?`Transcribe and translate the speech into ${String(input.language)}. Return only the translated spoken script, without commentary.`:'Transcribe the speech accurately. Return only the spoken words, without timestamps or commentary.';
        const transcript=await google(context,context.env.CINQRA_DIRECTOR_MODEL||'gemini-2.5-flash',{contents:[{parts:[{text:instruction},{inlineData:{mimeType:media.mimeType,data:media.data.toString('base64')}}]}],generationConfig:{maxOutputTokens:4096}});
        text=parts(transcript).map(part=>part.text??'').join('').trim();
        if(!text||text.length>12000)throw new Error('ERR_CREATIVE_TRANSCRIPT');
    }
    const result=await google(context,context.env.CINQRA_TTS_MODEL||'gemini-2.5-flash-preview-tts',{contents:[{parts:[{text}]}],generationConfig:{responseModalities:['AUDIO'],speechConfig:{voiceConfig:{prebuiltVoiceConfig:{voiceName:String(input.voice??'Kore')}}}}});
    const data=parts(result).find(part=>part.inlineData)?.inlineData;
    if(!data?.data||typeof data.data!=='string'||data.data.length>42*1024*1024)throw new Error('ERR_CREATIVE_AUDIO_RESPONSE');
    const pcm=Buffer.from(data.data,'base64');
    const wave=data.mimeType?.startsWith('audio/wav')?pcm:data.mimeType?.startsWith('audio/L16')||data.mimeType?.startsWith('audio/pcm')?pcmWave(pcm):null;
    if(!wave)throw new Error('ERR_CREATIVE_AUDIO_RESPONSE');
    return {status:'completed',outputs:[{url:await context.saveAudio(wave),mimeType:'audio/wav'}]};
}
