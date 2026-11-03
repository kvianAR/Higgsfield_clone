import { recordProviderHealth } from '@/lib/studio-reliability';
import { linkProjectJob } from './project-jobs';
import { creativeWorkspace } from './workspace';
import { constants } from 'node:fs';
import { mkdir,open,readFile,rename,rm,readdir,stat,lstat } from 'node:fs/promises';
import path from 'node:path';
import { createHash,randomUUID } from 'node:crypto';
import { STORAGE_ROOT } from '@/lib/storage-paths';
import { readCreativeAsset,saveCreativeAsset } from './workspace';
import { fetchRemoteMedia } from '@/lib/media-transfer';
import { findCreativeWorkflow,validateCreativeInput } from './workflows';
import { generateGoogleAudio,submitHiggsfield,pollHiggsfield,submitFreepik,pollFreepik,type ProviderContext,type ProviderResult,type CreativeOutput } from './jobs-provider';

export interface CreativeJob { id:string;workflowId:string;status:'submitting'|'queued'|'in_progress'|'completed'|'failed'|'cancelled'|'recovery_required';outputs:CreativeOutput[];input:Record<string,unknown>;createdAt:string;updatedAt:string;error?:string;projectId?:string }
interface StoredJob extends CreativeJob { fingerprint:string;requestId?:string;statusUrl?:string;pollingAt?:number }
export class CreativeJobError extends Error { constructor(public code:string,public status=400){super(code);} }
function cleanError(error:unknown) {const value=error instanceof Error?error.message:'';return /^ERR_[A-Z0-9_]{1,100}$/.test(value)?value:'ERR_CREATIVE_PROVIDER';}
function publicJob(job:StoredJob):CreativeJob {return {id:job.id,workflowId:job.workflowId,status:job.status,outputs:job.outputs,input:job.input,projectId:job.projectId,createdAt:job.createdAt,updatedAt:job.updatedAt,...(job.error?{error:job.error}:{})};}
function stable(value:unknown):unknown {if(Array.isArray(value))return value.map(stable);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,stable(v)]));return value;}
export function createCreativeJobs(options:{directory:string;env?:NodeJS.ProcessEnv;fetch?:typeof fetch;readAsset?:ProviderContext['readAsset'];materialize?:(output:CreativeOutput)=>Promise<CreativeOutput>}) {
    const directory=options.directory;const lock=path.join(directory,'.lock');const env=options.env??process.env;
    function id(value:string) {if(!/^[a-f0-9]{64}$/.test(value))throw new CreativeJobError('ERR_CREATIVE_JOB_ID');return value;}
    const filename=(value:string)=>path.join(directory,`${id(value)}.json`);
    async function prepare() {await mkdir(directory,{recursive:true,mode:0o700});if((await lstat(directory)).isSymbolicLink())throw new CreativeJobError('ERR_CREATIVE_STORAGE',503);}
    async function exclusive<T>(work:()=>Promise<T>) {
        await prepare();const deadline=Date.now()+5000;
        for(;;){try{await mkdir(lock,{mode:0o700});break;}catch(error){
            if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;
            try {const owner=JSON.parse(await readFile(path.join(lock,'owner.json'),'utf8'));if(Date.now()-(await stat(lock)).mtimeMs>120000){try{process.kill(owner.pid,0);}catch(e){if((e as NodeJS.ErrnoException).code==='ESRCH')await rm(lock,{recursive:true,force:true});}}}catch{}
            if(Date.now()>deadline)throw new CreativeJobError('ERR_CREATIVE_BUSY',503);
            await new Promise(resolve=>setTimeout(resolve,20));
        }}
        try{await writeFile(path.join(lock,'owner.json'),JSON.stringify({pid:process.pid}));return await work();}finally{await rm(lock,{recursive:true,force:true});}
    }
    async function writeFile(file:string,value:string|Buffer) {const handle=await open(file,'wx',0o600);try{await handle.writeFile(value);await handle.sync();}finally{await handle.close();}}
    async function read(value:string):Promise<StoredJob|null> {await prepare();let handle;try{handle=await open(filename(value),constants.O_RDONLY|constants.O_NOFOLLOW);if((await handle.stat()).size>256000)throw new Error('ERR_CREATIVE_STORAGE');return JSON.parse(await handle.readFile('utf8'));}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return null;throw error;}finally{await handle?.close();}}
    async function write(job:StoredJob) {const temporary=path.join(directory,`${randomUUID()}.tmp`);try{await writeFile(temporary,JSON.stringify(job));await rename(temporary,filename(job.id));}finally{await rm(temporary,{force:true});}}
    const context=(jobId:string):ProviderContext=>({env,fetch:options.fetch??fetch,readAsset:options.readAsset,saveAudio:async data=>{await prepare();const temp=path.join(directory,`${randomUUID()}.wav.tmp`);try{await writeFile(temp,data);await rename(temp,path.join(directory,`${id(jobId)}.wav`));}finally{await rm(temp,{force:true});}return `/api/creative/jobs/${jobId}/audio`;}});
    function withResult(job:StoredJob,result:ProviderResult):StoredJob {
        const workflow=findCreativeWorkflow(job.workflowId);
        const mime=workflow?.category==='audio'?'audio/wav':workflow?.category==='image'||workflow?.category==='marketing'?'image/png':'video/mp4';
        return {...job,status:result.status,requestId:result.requestId??job.requestId,statusUrl:result.statusUrl??job.statusUrl,outputs:(result.outputs??job.outputs).map(output=>({...output,mimeType:output.mimeType??mime})),...(result.error?{error:result.error}:{}),updatedAt:new Date().toISOString(),pollingAt:undefined};
    }
    async function materialize(job:StoredJob):Promise<StoredJob> {
        if(job.status!=='completed'||!options.materialize)return job;
        const outputs:CreativeOutput[]=[];
        for(const output of job.outputs) {
            if(output.url.startsWith('/')){outputs.push(output);continue;}
            try{outputs.push(await options.materialize(output));}
            catch{outputs.push(output);job.error='ERR_CREATIVE_OUTPUT_NOT_ARCHIVED_REMOTE_URL_MAY_EXPIRE';}
        }
        return {...job,outputs};
    }
    async function submit(raw:unknown):Promise<CreativeJob> {
        if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new CreativeJobError('ERR_CREATIVE_INPUT');
        const request=raw as {workflowId?:unknown;input?:unknown;clientRequestId?:unknown;projectId?:unknown};
        if(typeof request.workflowId!=='string'||typeof request.clientRequestId!=='string'||!/^[A-Za-z0-9_-]{8,100}$/.test(request.clientRequestId))throw new CreativeJobError('ERR_CREATIVE_REQUEST_ID');
        if (request.projectId !== undefined && (typeof request.projectId !== 'string' || !(await creativeWorkspace.read()).projects.some(project => project.id === request.projectId))) throw new CreativeJobError('ERR_PROJECT_NOT_FOUND');
        const workflow=findCreativeWorkflow(request.workflowId);
        if(!workflow?.available)throw new CreativeJobError('ERR_CREATIVE_WORKFLOW_UNAVAILABLE',409);
        let input:Record<string,unknown>;try{input=validateCreativeInput(workflow,request.input);}catch(error){throw new CreativeJobError(cleanError(error));}
        if(workflow.provider==='higgsfield'&&(!env.HF_API_KEY_ID||!env.HF_API_KEY_SECRET))throw new CreativeJobError('ERR_HIGGSFIELD_NOT_CONFIGURED',409);
        if(workflow.provider==='google'&&(!env.GEMINI_API_KEY&&!env.GOOGLE_AI_API_KEY))throw new CreativeJobError('ERR_GOOGLE_NOT_CONFIGURED',409);
        if(workflow.provider==='freepik'&&!env.FREEPIK_API_KEY)throw new CreativeJobError('ERR_FREEPIK_NOT_CONFIGURED',409);
        const jobId=createHash('sha256').update(request.clientRequestId).digest('hex');
        const fingerprint=createHash('sha256').update(JSON.stringify(stable({workflowId:workflow.id,input}))).digest('hex');
        let reserved=false;
        let job=await exclusive(async()=>{
            const existing=await read(jobId);
            if(existing){if(existing.fingerprint!==fingerprint)throw new CreativeJobError('ERR_CREATIVE_IDEMPOTENCY_CONFLICT',409);return existing;}
            if((await readdir(directory)).filter(file=>file.endsWith('.json')).length>=2000)throw new CreativeJobError('ERR_CREATIVE_JOB_CAPACITY',413);
            const now=new Date().toISOString();const pending:StoredJob={id:jobId,workflowId:workflow.id,input,projectId:request.projectId as string | undefined,status:'submitting',outputs:[],fingerprint,createdAt:now,updatedAt:now};await write(pending);reserved=true;return pending;
        });
        if(!reserved)return publicJob(job);
        try {
            const result=workflow.provider==='google'?await generateGoogleAudio(context(jobId),workflow,input):workflow.provider==='freepik'?await submitFreepik(context(jobId),input):await submitHiggsfield(context(jobId),workflow,input,jobId);
            job=await materialize(withResult(job,result));
        }catch(error){
            const code=cleanError(error);
            // Unknown network/server acceptance must not trigger another paid submission.
            const uncertain=/NETWORK_UNCERTAIN|PROVIDER_RESPONSE|REQUEST_ID|STATUS_URL|HTTP_5\d\d/.test(code);
            job={...job,status:uncertain?'recovery_required':'failed',error:code,updatedAt:new Date().toISOString()};
        }
        await exclusive(()=>write(job));
        await linkProjectJob(job).catch(async () => { job.error = 'ERR_PROJECT_LINK_PENDING'; await exclusive(() => write(job)); });
        if (job.status === 'failed') {
            const failedWorkflow = findCreativeWorkflow(job.workflowId);
            const code = job.error ?? 'ERR_GENERATION_FAILED';
            const health = /401|AUTH|INVALID_KEY/.test(code) ? 'invalid_key' : /402|BALANCE|CREDIT/.test(code) ? 'balance_issue' : /403|ACCESS|PERMISSION/.test(code) ? 'access_issue' : 'generation_failed';
            if (failedWorkflow) await recordProviderHealth(failedWorkflow.provider, health, code).catch(() => {});
        }

        if (job.status === 'completed') await recordProviderHealth(workflow.provider, 'generation_verified', `Completed ${workflow.id}`).catch(() => {});
        return publicJob(job);
    }
    async function get(jobId:string,poll=true):Promise<CreativeJob|null> {
        let job=await read(jobId);if(!job)return null;
        if(job.status==='submitting'&&Date.now()-Date.parse(job.createdAt)>120000){job={...job,status:'recovery_required',error:'ERR_CREATIVE_INTERRUPTED_SUBMISSION',updatedAt:new Date().toISOString()};await exclusive(()=>write(job!));}
        if (job.projectId && job.error === 'ERR_PROJECT_LINK_PENDING') {
            try { await linkProjectJob(job); delete job.error; await exclusive(() => write(job)); } catch { /* Retain pending link for a later reconciliation. */ }
        }
        if(!poll||!['queued','in_progress'].includes(job.status)||!job.requestId||!job.statusUrl)return publicJob(job);
        const selected=await exclusive(async()=>{const current=await read(jobId);if(!current||!['queued','in_progress'].includes(current.status)||(current.pollingAt&&Date.now()-current.pollingAt<30000)||Date.now()-Date.parse(current.updatedAt)<1500)return null;current.pollingAt=Date.now();await write(current);return current;});
        if(!selected)return publicJob(job);
        try{const workflow=findCreativeWorkflow(selected.workflowId);const result=workflow?.provider==='freepik'?await pollFreepik(context(jobId),selected.requestId!,selected.statusUrl!):await pollHiggsfield(context(jobId),selected.requestId!,selected.statusUrl!);job=await materialize(withResult(selected,result));}
        catch(error){job={...selected,error:cleanError(error),pollingAt:undefined,updatedAt:new Date().toISOString()};}
        await exclusive(()=>write(job!));
        await linkProjectJob(job).catch(async () => { job.error = 'ERR_PROJECT_LINK_PENDING'; await exclusive(() => write(job)); });
        if (job.status === 'failed') {
            const failedWorkflow = findCreativeWorkflow(job.workflowId);
            const code = job.error ?? 'ERR_GENERATION_FAILED';
            const health = /401|AUTH|INVALID_KEY/.test(code) ? 'invalid_key' : /402|BALANCE|CREDIT/.test(code) ? 'balance_issue' : /403|ACCESS|PERMISSION/.test(code) ? 'access_issue' : 'generation_failed';
            if (failedWorkflow) await recordProviderHealth(failedWorkflow.provider, health, code).catch(() => {});
        }

        if (job.status === 'completed') {
            const completedWorkflow = findCreativeWorkflow(job.workflowId);
            if (completedWorkflow) await recordProviderHealth(completedWorkflow.provider, 'generation_verified', `Completed ${completedWorkflow.id}`).catch(() => {});
        }
        return publicJob(job);
    }
    async function list() {await prepare();const files=(await readdir(directory)).filter(file=>/^[a-f0-9]{64}\.json$/.test(file));const jobs=await Promise.all(files.map(file=>read(file.slice(0,-5))));return jobs.filter((job):job is StoredJob=>Boolean(job)).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,200).map(publicJob);}
    async function audio(jobId:string) {const job=await read(jobId);if(!job||job.status!=='completed'||!job.outputs.some(output=>output.mimeType==='audio/wav'))throw new CreativeJobError('ERR_CREATIVE_NOT_FOUND',404);const handle=await open(path.join(directory,`${id(jobId)}.wav`),constants.O_RDONLY|constants.O_NOFOLLOW);try{if((await handle.stat()).size>32*1024*1024)throw new Error('ERR_CREATIVE_AUDIO_LIMIT');return await handle.readFile();}finally{await handle.close();}}
    return {submit,get,list,audio};
}
export const creativeJobs=createCreativeJobs({directory:path.join(STORAGE_ROOT,'.cinqra-creative-jobs'),readAsset:readCreativeAsset,materialize:async output=>{const media=await fetchRemoteMedia(output.url,{maxBytes:64*1024*1024});const extension=media.mimeType.startsWith('video/')?'mp4':media.mimeType.startsWith('audio/')?'wav':'png';const asset=await saveCreativeAsset(media.data,`Generation.${extension}`,media.mimeType);return {url:asset.url,mimeType:asset.mimeType};}});
export function creativeJobFailure(error:unknown) {return Response.json({error:error instanceof CreativeJobError?error.code:cleanError(error)},{status:error instanceof CreativeJobError?error.status:503,headers:{'Cache-Control':'private, no-store'}});}
