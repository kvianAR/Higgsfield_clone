import { guardWorkspaceRequest,applyWorkspaceHeaders } from '@/lib/workspace-access';
import { creativeJobs,creativeJobFailure } from '@/lib/creative/jobs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}) {
    const denial=guardWorkspaceRequest(request);if(denial)return denial;
    try{const data=await creativeJobs.audio((await params).id);return applyWorkspaceHeaders(new Response(data as BodyInit,{headers:{'Content-Type':'audio/wav','Content-Disposition':'inline; filename="cinqra-voiceover.wav"'}}));}catch(error){return creativeJobFailure(error);}
}
