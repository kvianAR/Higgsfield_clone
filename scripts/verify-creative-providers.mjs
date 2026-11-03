import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createModuleLoader} from './test-module-loader.mjs';
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
const env={HF_API_KEY_ID:'synthetic-key-id',HF_API_KEY_SECRET:'synthetic-key-secret',GEMINI_API_KEY:'synthetic-google-key',FREEPIK_API_KEY:'synthetic-freepik-key'};
function modules(fetcher=async()=>json({}),extra={}){return createModuleLoader({env,globals:{fetch:fetcher},mocks:{'@/lib/creative/workspace':{readCreativeAsset:async()=>({data:Buffer.from('fake'),mimeType:'image/png'}),saveCreativeAsset:async()=>({url:'/api/creative/assets/synthetic',mimeType:'image/png'})},...extra}});}
test('creative catalog has real schema-backed image, editing, cinema, motion, marketing and provider-specific audio/lipsync workflows',()=>{
 const {load}=modules();const {CREATIVE_WORKFLOWS,publicCreativeWorkflows}=load('@/lib/creative/workflows');
 assert.ok(CREATIVE_WORKFLOWS.length>=55);
 for(const id of ['higgsfield-ai/soul/v2/image-to-image','kling-video/v4.0/video-edit','higgsfield/cinema-studio/4.0','higgsfield/genjutsu/motion-transfer/v1.0','higgsfield/ads-studio/v1.0','audio-tts','audio-translate','omnihuman-lipsync'])assert.equal(CREATIVE_WORKFLOWS.find(w=>w.id===id)?.available,true,id);
 assert.equal(CREATIVE_WORKFLOWS.find(w=>w.id==='inpaint').available,false);
 assert.equal(JSON.stringify(publicCreativeWorkflows()).includes('"endpoint"'),false);
});
test('schema validation rejects invalid choices, unknown fields and conditional missing media before paid network',()=>{
 const {load}=modules();const {findCreativeWorkflow,validateCreativeInput}=load('@/lib/creative/workflows');
 const workflow=findCreativeWorkflow('bytedance/seedance-2.5/reference-to-video');
 assert.throws(()=>validateCreativeInput(workflow,{prompt:'Scene'}),/ERR_CREATIVE_INPUT/);
 assert.throws(()=>validateCreativeInput(workflow,{prompt:'Scene',image_urls:['https://example.com/a.png'],resolution:'bad'}),/ERR_CREATIVE_INPUT/);
 assert.throws(()=>validateCreativeInput(workflow,{prompt:'Scene',unknown:true}),/ERR_CREATIVE_UNKNOWN_INPUT/);
 assert.doesNotThrow(()=>validateCreativeInput(workflow,{prompt:'Scene',image_urls:'["https://example.com/a.png"]'}));
 const marketing=findCreativeWorkflow('marketing-studio/image');
 assert.throws(()=>validateCreativeInput(marketing,{prompt:'Scene',enhance_prompt:true}),/ERR_CREATIVE_INPUT/);
});
test('Higgsfield credentials stay only at API origin and local asset upload does not forward them to storage',async()=>{
 const calls=[];const {load}=modules();const provider=load('@/lib/creative/jobs-provider');const workflows=load('@/lib/creative/workflows');
 const context={env,saveAudio:async()=>'',readAsset:async()=>({data:Buffer.from('synthetic'),mimeType:'image/png'}),fetch:async(url,init)=>{calls.push({url,...init});if(url.endsWith('/files/generate-upload-url'))return json({public_url:'https://example.com/input.png',upload_url:'https://example.com/upload',upload_headers:{'Content-Type':'image/png'}});if(url==='https://example.com/upload')return new Response('',{status:200});return json({request_id:'request-1',status:'queued',status_url:'https://api.higgsfield.ai/requests/request-1/status'});}};
 const result=await provider.submitHiggsfield(context,workflows.findCreativeWorkflow('higgsfield-ai/soul/v2/image-to-image'),{prompt:'A portrait',image_url:'/api/creative/assets/synthetic'},'a'.repeat(64));
 assert.equal(result.status,'queued');assert.equal(calls.length,3);assert.equal(calls[1].headers.Authorization,undefined);assert.equal(calls[2].headers['Idempotency-Key'],'a'.repeat(64));assert.equal(JSON.stringify(result).includes(env.HF_API_KEY_SECRET),false);
 await assert.rejects(provider.pollHiggsfield(context,'request-1','https://example.com/steal'),/ERR_CREATIVE_STATUS_URL/);
});
test('durable job idempotency survives concurrent callers and process reload without resubmission',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'cinqra-jobs-test-'));let submissions=0;
 const fetcher=async()=>{submissions++;return json({request_id:'request-2',status:'queued',status_url:'https://api.higgsfield.ai/requests/request-2/status'});};
 try{const {load}=modules();const {createCreativeJobs}=load('@/lib/creative/jobs');const store=createCreativeJobs({directory,env,fetch:fetcher});const input={workflowId:'higgsfield-ai/soul/v2/standard',input:{prompt:'Scene'},clientRequestId:'synthetic-request-1234'};
 const jobs=await Promise.all([store.submit(input),store.submit(input)]);assert.equal(jobs[0].id,jobs[1].id);assert.equal(submissions,1);
 const reloaded=createCreativeJobs({directory,env,fetch:fetcher});await reloaded.submit(input);assert.equal(submissions,1);
 await assert.rejects(reloaded.submit({...input,input:{prompt:'Different'}}),/ERR_CREATIVE_IDEMPOTENCY_CONFLICT/);
 assert.equal(JSON.stringify(await store.list()).includes('statusUrl'),false);
 }finally{await rm(directory,{recursive:true,force:true});}
});
test('ambiguous paid submission becomes recovery_required and is never auto-submitted again',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'cinqra-jobs-test-'));let calls=0;
 try{const {load}=modules();const store=load('@/lib/creative/jobs').createCreativeJobs({directory,env,fetch:async()=>{calls++;throw new Error('sensitive backend failure');}});const input={workflowId:'higgsfield-ai/soul/v2/standard',input:{prompt:'Scene'},clientRequestId:'synthetic-request-uncertain'};const first=await store.submit(input);assert.equal(first.status,'recovery_required');await store.submit(input);assert.equal(calls,1);assert.equal(JSON.stringify(first).includes('sensitive'),false);}finally{await rm(directory,{recursive:true,force:true});}
});
test('Google TTS creates actual WAV and director accepts validated structured shots',async()=>{
 const {load}=modules();const provider=load('@/lib/creative/jobs-provider');const workflows=load('@/lib/creative/workflows');let wave;
 const context={env,saveAudio:async(data)=>{wave=data;return '/api/creative/jobs/synthetic/audio';},fetch:async()=>json({candidates:[{content:{parts:[{inlineData:{mimeType:'audio/L16;codec=pcm;rate=24000',data:Buffer.from([0,0,1,0]).toString('base64')}}]}}]})};
 const audio=await provider.generateGoogleAudio(context,workflows.findCreativeWorkflow('audio-tts'),{text:'Hello',voice:'Kore'});assert.equal(audio.status,'completed');assert.equal(wave.toString('ascii',0,4),'RIFF');assert.equal(wave.readUInt32LE(24),24000);
 const director=await provider.runDirector({...context,fetch:async()=>json({candidates:[{content:{parts:[{text:JSON.stringify({text:'Direction',shots:[{title:'Opening',prompt:'A wide desert shot',duration:5}]})}]}}]})},'A desert story','storyboard');assert.equal(director.shots.length,1);
 await assert.rejects(provider.runDirector({...context,env:{}},'Scene','prompt'),/ERR_GOOGLE_NOT_CONFIGURED/);
});
test('Freepik talking-head workflow enforces fixed endpoint and public-media inputs',async()=>{
 const {load}=modules();const provider=load('@/lib/creative/jobs-provider');const calls=[];const context={env,saveAudio:async()=>'',fetch:async(url,init)=>{calls.push({url,...init});return json({data:{task_id:'freepik-task'}});}};
 await assert.rejects(provider.submitFreepik(context,{image_url:'/api/creative/assets/test',audio_url:'https://example.com/a.wav'}),/ERR_CREATIVE_FREEPIK_PUBLIC_MEDIA_REQUIRED/);
 const result=await provider.submitFreepik(context,{image_url:'https://example.com/a.png',audio_url:'https://example.com/a.wav'});assert.equal(result.status,'queued');assert.equal(calls[0].url,'https://api.freepik.com/v1/ai/video/omni-human-1-5');assert.equal(calls[0].headers['x-freepik-api-key'],env.FREEPIK_API_KEY);
 await assert.rejects(provider.pollFreepik(context,'freepik-task','https://example.com/steal'),/ERR_CREATIVE_STATUS_URL/);
});
