import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, stat, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import ffmpeg from 'ffmpeg-static';
import { createModuleLoader } from './test-module-loader.mjs';
const {load}=createModuleLoader();
const {parseVideoRenderSettings,videoRenderArgs}=load('@/lib/creative/video-render');
const settings={start:0,end:1,ratio:'9:16',height:360,fit:'cover',freeze:0.5,volume:0};
test('video settings constrain duration, dimensions, audio and filter values',()=>{
    assert.equal(parseVideoRenderSettings(settings).height,360);
    for(const bad of [{end:0},{end:61},{freeze:16},{ratio:'16:9;movie=https://bad'},{height:8000},{start:NaN},{volume:3},{fit:'expression'}]){
        assert.throws(()=>parseVideoRenderSettings({...settings,...bad}));
    }
});
test('video arguments use safe enum-derived filters and explicit local-only protocols',()=>{
    const args=videoRenderArgs('/tmp/source with spaces.mp4','/tmp/result.mp4',settings);
    assert.equal(args[args.indexOf('-i')+1],'/tmp/source with spaces.mp4');
    assert.equal(args[args.indexOf('-protocol_whitelist')+1],'file,pipe');
    assert.match(args[args.indexOf('-vf')+1],/crop=202:360/);
    assert.match(args[args.indexOf('-vf')+1],/tpad=stop_mode=clone:stop_duration=0.5/);
    assert.match(args[args.indexOf('-af')+1],/volume=0/);
});
test('real ffmpeg fixture supports crop, resize, audio volume and freeze-tail MP4 export',async()=>{
    assert.ok(ffmpeg,'ffmpeg-static binary must be installed');
    const directory=await mkdtemp(path.join(os.tmpdir(),'cinqra-video-test-'));
    try{
        const input=path.join(directory,'input.mp4'),output=path.join(directory,'output.mp4');
        const fixture=spawnSync(ffmpeg,['-hide_banner','-loglevel','error','-y','-f','lavfi','-i','color=c=purple:s=320x240:r=15:d=1','-f','lavfi','-i','sine=frequency=440:duration=1','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-shortest',input],{timeout:20000});
        assert.equal(fixture.status,0,fixture.stderr?.toString());
        let saved;
        const routeLoader=createModuleLoader({ env:{APP_ORIGIN:'http://127.0.0.1:3017'},mocks:{
            '@/lib/creative/workspace':{
                readCreativeAsset:async()=>{throw new Error('unexpected read');},
                saveCreativeAsset:async(bytes,name,mimeType)=>{saved={bytes,name,mimeType};return{id:'fixture-edit',name,url:'/api/creative/assets/fixture-edit',mimeType,size:bytes.length,createdAt:new Date().toISOString()};},
                creativeFailure:()=>Response.json({error:'unexpected'},{status:503}),
            }
        }});
        const route=routeLoader.load('src/app/api/creative/video-render/route.ts');
        const form=new FormData();form.set('file',new File([await readFile(input)],'fixture.mp4',{type:'video/mp4'}));form.set('settings',JSON.stringify(settings));
        const response=await route.POST(new Request('http://127.0.0.1:3017/api/creative/video-render',{method:'POST',headers:{origin:'http://127.0.0.1:3017'},body:form}));
        assert.equal(response.status,201,await response.clone().text());
        assert.equal((await response.json()).asset.id,'fixture-edit');assert.equal(saved.mimeType,'video/mp4');assert.ok(saved.bytes.length>1000);
        const denied=await route.POST(new Request('http://127.0.0.1:3017/api/creative/video-render',{method:'POST',headers:{origin:'https://outside.example'}}));
        assert.equal(denied.status,403);
        const result=spawnSync(ffmpeg,videoRenderArgs(input,output,settings),{timeout:30000});
        assert.equal(result.status,0,result.stderr?.toString());
        assert.ok((await stat(output)).size>1000);
        const probe=spawnSync(ffmpeg,['-hide_banner','-i',output],{timeout:10000});
        const info=probe.stderr.toString();
        assert.match(info,/202x360/);assert.match(info,/Duration: 00:00:01\.5/);assert.match(info,/Audio: aac/);
        const silent=path.join(directory,'silent.mp4');
        const noAudio=spawnSync(ffmpeg,['-hide_banner','-loglevel','error','-y','-f','lavfi','-i','color=c=blue:s=160x90:r=15:d=1','-c:v','libx264','-pix_fmt','yuv420p',silent],{timeout:20000});
        assert.equal(noAudio.status,0);
        const renderSilent=spawnSync(ffmpeg,videoRenderArgs(silent,path.join(directory,'silent-output.mp4'),{...settings,ratio:'source',freeze:0}),{timeout:30000});
        assert.equal(renderSilent.status,0,renderSilent.stderr?.toString());
    }finally{await rm(directory,{recursive:true,force:true});}
});
