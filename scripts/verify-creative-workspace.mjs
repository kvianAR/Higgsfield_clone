import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, stat, symlink, writeFile, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createModuleLoader } from './test-module-loader.mjs';
import { configuration, projectExport } from '../integrations/client.mjs';

async function fixture(run) { const directory = await mkdtemp(path.join(os.tmpdir(), 'cinqra-creative-')); try { const loader = createModuleLoader({ mocks: { '@/lib/storage-paths': { STORAGE_ROOT: directory } } }); await run(loader, directory); } finally { await rm(directory, { recursive: true, force: true }); } }
const project = (revision = 0) => ({ action:'put',kind:'projects',expectedRevision:revision,record:{id:'project-one',name:'One film',brief:'A short scene.'} });

test('creative shared workspace is durable, owner-readable and rejects stale concurrent writes', async () => fixture(async (loader,directory) => {
    const { createCreativeWorkspaceStore } = loader.load('@/lib/creative/workspace'); const dir = path.join(directory,'store'); const store = createCreativeWorkspaceStore(dir);
    assert.equal((await store.read()).revision,0);
    const results = await Promise.allSettled([store.mutate(project()),store.mutate({...project(),record:{id:'project-two',name:'Other film'}})]);
    assert.equal(results.filter(result=>result.status==='fulfilled').length,1);
    assert.equal(results.find(result=>result.status==='rejected').reason.status,409);
    const restored = await createCreativeWorkspaceStore(dir).read(); assert.equal(restored.revision,1); assert.equal(restored.projects.length,1);
    assert.equal((await stat(path.join(dir,'workspace.json'))).mode & 0o777,0o600);
}));

test('creative records validate references, limits, generated metadata and cascading removal', async () => fixture(async loader => {
    const { creativeWorkspace:store } = loader.load('@/lib/creative/workspace'); let state = await store.mutate(project());
    await assert.rejects(store.mutate({action:'put',kind:'shots',expectedRevision:state.revision,record:{id:'shot',projectId:'missing',title:'Shot'}}),/ERR_CREATIVE_REFERENCE_MISSING/);
    await assert.rejects(store.mutate({...project(state.revision),record:{id:'../escape',name:'Bad'}}),/ERR_CREATIVE_ID/);
    await assert.rejects(store.mutate({...project(state.revision),record:{id:'new',name:'x'.repeat(161)}}),/ERR_CREATIVE_FIELD/);
    state = await store.mutate({action:'put',kind:'elements',expectedRevision:state.revision,record:{id:'actor',name:'Explorer',kind:'character',description:'Blue coat'}});
    state = await store.mutate({action:'put',kind:'shots',expectedRevision:state.revision,record:{id:'shot',projectId:'project-one',title:'Opening',prompt:'Explorer crosses desert',elementIds:['actor'],order:0,duration:6}});
    state = await store.mutate({action:'remove',kind:'elements',id:'actor',expectedRevision:state.revision}); assert.equal(state.shots[0].elementIds.length,0);
    state = await store.mutate({action:'remove',kind:'projects',id:'project-one',expectedRevision:state.revision}); assert.equal(state.shots.length,0);
}));

test('workspace community supports real publishing, counters and traceable remix without trusting supplied likes', async () => fixture(async loader => {
    const {creativeWorkspace:store}=loader.load('@/lib/creative/workspace');
    let state=await store.mutate({action:'put',kind:'posts',expectedRevision:0,record:{id:'post',title:'Shot',prompt:'Cinematic desert',author:'Creator',likes:999}});
    assert.equal(state.posts[0].likes,0);
    state=await store.mutate({action:'like',kind:'posts',id:'post',expectedRevision:1}); assert.equal(state.posts[0].likes,1);
    state=await store.mutate({action:'remix',kind:'posts',id:'post',author:'Second creator',expectedRevision:2});
    assert.equal(state.posts.length,2); assert.equal(state.posts[1].sourceId,'post'); assert.equal(state.posts[1].likes,0);
}));

test('workspace refuses symlinked state instead of reading another local file', async () => fixture(async (loader,directory) => {
    const {createCreativeWorkspaceStore}=loader.load('@/lib/creative/workspace'); const store=createCreativeWorkspaceStore(directory); await writeFile(path.join(directory,'private.json'),'{}'); await symlink(path.join(directory,'private.json'),path.join(directory,'workspace.json'));
    await assert.rejects(store.read(),/ERR_CREATIVE_STORAGE/); assert.equal(await readFile(path.join(directory,'private.json'),'utf8'),'{}');
}));

test('asset upload, protected lookup and invalid media checks use real route handlers', async () => fixture(async loader => {
    const assets=loader.load('src/app/api/creative/assets/route.ts'); const detail=loader.load('src/app/api/creative/assets/[id]/route.ts');
    const form=new FormData(); form.append('file',new File([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJ9sAAAAASUVORK5CYII=','base64')],'frame.png',{type:'image/png'}));
    const created=await assets.POST(new Request('http://127.0.0.1:3017/api/creative/assets',{method:'POST',headers:{Origin:'http://127.0.0.1:3017'},body:form})); assert.equal(created.status,201);
    const asset=await created.json(); assert.equal(asset.mimeType,'image/png'); assert.equal(asset.url,`/api/creative/assets/${asset.id}`); assert.ok(!JSON.stringify(asset).includes('cinqra-creative-'));
    const response=await detail.GET(new Request(`http://127.0.0.1:3017${asset.url}`),{params:Promise.resolve({id:asset.id})}); assert.equal(response.status,200); assert.equal(response.headers.get('Content-Type'),'image/png'); assert.equal((await response.arrayBuffer()).byteLength,asset.size);
    const invalid=new FormData(); invalid.append('file',new File(['<script>bad</script>'],'bad.png',{type:'image/png'}));
    const rejected=await assets.POST(new Request('http://127.0.0.1:3017/api/creative/assets',{method:'POST',headers:{Origin:'http://127.0.0.1:3017'},body:invalid})); assert.equal(rejected.status,415);
    const foreign=await assets.POST(new Request('http://127.0.0.1:3017/api/creative/assets',{method:'POST',headers:{Origin:'https://foreign.example'},body:new FormData()})); assert.equal(foreign.status,403);
}));

test('project handoff preserves ordered shots and only referenced assets, never configuration secrets', () => {
    const result=projectExport({projects:[{id:'p',name:'Film'}],shots:[{id:'s2',projectId:'p',order:2,elementIds:['e'],assetIds:[]},{id:'s1',projectId:'p',order:1,elementIds:[],assetIds:[]}],elements:[{id:'e',assetIds:['a']}],assets:[{id:'a',url:'/api/creative/assets/a'},{id:'unrelated',url:'/api/creative/assets/unrelated'}]},'p',new URL('http://127.0.0.1:3017'));
    assert.equal(result.shots[0].id,'s1');assert.equal(result.assets.length,1);assert.equal(result.assets[0].url,'http://127.0.0.1:3017/api/creative/assets/a');
    assert.throws(()=>configuration({CINQRA_URL:'http://example.com'}),/HTTPS/);assert.throws(()=>configuration({CINQRA_URL:'http://secret@example.com'}),/credentials/);
});

test('MCP server initializes and advertises actual tool schemas without stdout noise', () => {
    const input=[{jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2024-11-05',capabilities:{},clientInfo:{name:'test',version:'1'}}},{jsonrpc:'2.0',id:2,method:'tools/list'},{jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'cinqra_generate',arguments:{workflowId:'x'}}}].map(JSON.stringify).join('\n')+'\n';
    const child=spawnSync(process.execPath,[path.resolve('integrations/mcp-server.mjs')],{input,encoding:'utf8',timeout:10_000}); assert.equal(child.status,0,child.stderr);
    const messages=child.stdout.trim().split('\n').map(JSON.parse); assert.equal(messages.length,3);assert.equal(messages[0].result.protocolVersion,'2024-11-05');assert.equal(messages[1].result.tools.length,5);assert.equal(messages[2].result.isError,true);
});

test('creative multipart override allows larger media while original generation keeps 4 MiB cap', async () => fixture(async loader => {
    const {readGenerationForm}=loader.load('@/lib/request-limits');
    const form = () => { const data=new FormData();data.append('file',new File([Buffer.alloc(4*1024*1024+1)],'large.mp4',{type:'video/mp4'}));return data; };
    await assert.rejects(readGenerationForm(new Request('http://127.0.0.1/form',{method:'POST',body:form()})),error=>error.status===413);
    const accepted=await readGenerationForm(new Request('http://127.0.0.1/form',{method:'POST',body:form()}),{maxBytes:5*1024*1024}); assert.equal(accepted.get('file').size,4*1024*1024+1);
    await assert.rejects(readGenerationForm(new Request('http://127.0.0.1/form',{method:'POST',body:form()}),{maxBytes:128}),error=>error.status===413);
    await assert.rejects(readGenerationForm(new Request('http://127.0.0.1/form',{method:'POST',body:form()}),{maxBytes:65*1024*1024}),error=>error.status===400);
}));

test('creative saved media helper only reads registered exact workspace URLs', async () => fixture(async loader => {
    const {saveCreativeAsset,readCreativeAsset}=loader.load('@/lib/creative/workspace'); const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJ9sAAAAASUVORK5CYII=','base64');
    const asset=await saveCreativeAsset(bytes,'frame.png','image/png');const restored=await readCreativeAsset(asset.url);assert.deepEqual(Buffer.from(restored.data),bytes);
    for(const url of [`https://example.com${asset.url}`,`${asset.url}?token=secret`,`${asset.url}#x`,'/api/creative/assets/../outside'])await assert.rejects(readCreativeAsset(url),/ERR_CREATIVE_ASSET_URL/);
}));
