import { guardWorkspaceRequest,applyWorkspaceHeaders } from '@/lib/workspace-access';
import { readBoundedJson,requestFailure } from '@/lib/request-limits';
import { creativeJobs,creativeJobFailure } from '@/lib/creative/jobs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request) {
    const denial=guardWorkspaceRequest(request);if(denial)return denial;
    try{const id=new URL(request.url).searchParams.get('id');if(!id)return applyWorkspaceHeaders(Response.json({jobs:await creativeJobs.list()}));const job=await creativeJobs.get(id);return applyWorkspaceHeaders(Response.json(job??{error:'ERR_CREATIVE_NOT_FOUND'},{status:job?200:404}));}catch(error){return creativeJobFailure(error);}
}
export async function POST(request:Request) {
    const denial=guardWorkspaceRequest(request);if(denial)return denial;
    let input:unknown;try{input=await readBoundedJson(request,256000);}catch(error){return requestFailure(error);}
    try{return applyWorkspaceHeaders(Response.json(await creativeJobs.submit(input),{status:202}));}catch(error){return creativeJobFailure(error);}
}
