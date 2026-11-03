import { guardWorkspaceRequest,applyWorkspaceHeaders } from '@/lib/workspace-access';
import { readBoundedJson,requestFailure } from '@/lib/request-limits';
import { runDirector } from '@/lib/creative/jobs-provider';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(request:Request) {
    const denial=guardWorkspaceRequest(request);if(denial)return denial;
    let raw:unknown;try{raw=await readBoundedJson(request,32000);}catch(error){return requestFailure(error);}
    const input=raw as {brief?:unknown;mode?:unknown;context?:unknown};
    if(!input||typeof input.brief!=='string'||!['prompt','storyboard'].includes(String(input.mode))||(input.context!==undefined&&typeof input.context!=='string'))return Response.json({error:'ERR_CREATIVE_DIRECTOR_INPUT'},{status:400});
    try{return applyWorkspaceHeaders(Response.json(await runDirector({env:process.env,fetch,saveAudio:async()=>{throw new Error('ERR_CREATIVE_DIRECTOR_ONLY');}},input.brief,input.mode as 'prompt'|'storyboard',String(input.context??''))));}
    catch(error){const code=error instanceof Error&&/^ERR_[A-Z0-9_]+$/.test(error.message)?error.message:'ERR_CREATIVE_DIRECTOR';return applyWorkspaceHeaders(Response.json({error:code},{status:code==='ERR_GOOGLE_NOT_CONFIGURED'?409:502}));}
}
