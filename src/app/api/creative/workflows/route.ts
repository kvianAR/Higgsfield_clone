import { guardWorkspaceRequest,applyWorkspaceHeaders } from '@/lib/workspace-access';
import { publicCreativeWorkflows } from '@/lib/creative/workflows';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request) {
    const denial=guardWorkspaceRequest(request);if(denial)return denial;
    return applyWorkspaceHeaders(Response.json({workflows:publicCreativeWorkflows(),configured:{higgsfield:Boolean(process.env.HF_API_KEY_ID&&process.env.HF_API_KEY_SECRET),google:Boolean(process.env.GEMINI_API_KEY||process.env.GOOGLE_AI_API_KEY),freepik:Boolean(process.env.FREEPIK_API_KEY)}}));
}
