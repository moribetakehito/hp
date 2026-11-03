import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, stat, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { build, validate } from './build.mjs';
import { createManager } from './manager.mjs';
import { publish } from './publish.mjs';
import { nextWorkDate } from '../manager/date.js';
import { createGitHubAuth, authEnvironment } from './auth.mjs';

const sample = () => ({ works: [{ id:'20260529',date:'20260529',title:'作品 <&>',images:['/works/uploads/image.png'] }] });
test('duplicate dates, invalid calendar dates and image path traversal cannot be saved',()=>{
  for (const date of ['../about','20260230','20260230_1','20261301','2026011','20260529_0','20260529_01','20260529_','20260529_-1','']) {
    const data=sample();data.works[0].date=date;assert.throws(()=>validate(data));
  }
  const duplicate=sample();duplicate.works.push({...duplicate.works[0]});assert.throws(()=>validate(duplicate));
  const malicious=sample();malicious.works[0].images=['/works/../../.git/config'];assert.throws(()=>validate(malicious));
});
test('optional numeric suffix supports multiple same-day works and sorts 10 above 2',()=>{
  const data=sample();
  for(const date of ['20260529_1','20260529_2','20260529_10'])data.works.push({...data.works[0],date});
  const result=validate(data);
  assert.deepEqual(result.works.map(w=>w.id),['20260529_10','20260529_2','20260529_1','20260529']);
  assert.equal(nextWorkDate('20261102',[]),'20261102');
  assert.equal(nextWorkDate('20261102',['20261102']),'20261102_1');
  assert.equal(nextWorkDate('20261102',['20261102','20261102_2']),'20261102_3');
  data.works.push({...data.works[1]});assert.throws(()=>validate(data),/重複/);
});
test('date is the only identifier, legacy work number is discarded, newest works come first',()=>{
  const data=sample();data.works[0].id='old_identifier';data.works[0].number='002';
  data.works.push({...data.works[0],date:'20261102'});
  const result=validate(data);
  assert.deepEqual(result.works.map(w=>w.id),['20261102','20260529']);
  assert.equal(result.works[0].number,undefined);
});
test('Pages build creates directly accessible work URLs, excludes manager, preserves old preview on validation failure',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'moribe-site-'));
  try {
    for(const dir of ['works/work','works/uploads','about','portfolio','admin','.manager','manager'])await mkdir(path.join(root,dir),{recursive:true});
    for(const file of ['index.html','stylesheet.css','favicon.png','portrait.jpg','works/uploads/image.png'])await writeFile(path.join(root,file),'fixture');
    await writeFile(path.join(root,'admin/secret'),'do not publish');
    await writeFile(path.join(root,'works/work/index.html'),'<title>work - moribe takehito</title><main data-work-detail></main>');
    const input=sample();input.works.push({...input.works[0],date:'20260529_1'});
    const result=await build({root,data:input});
    const html=await readFile(path.join(result.out,'works/20260529/index.html'),'utf8');
    assert.match(html,/data-work-id="20260529"/);assert.match(html,/作品 &lt;&amp;&gt;/);
    assert.match(await readFile(path.join(result.out,'works/20260529_1/index.html'),'utf8'),/data-work-id="20260529_1"/);
    assert.equal(await readFile(path.join(result.out,'CNAME'),'utf8'),'moribetakehito.com\n');
    for(const dir of ['admin','manager','.manager','.git','tools'])assert.equal(await stat(path.join(result.out,dir)).catch(()=>null),null);
    const missing=sample();missing.works[0].images=['/missing.png'];
    await assert.rejects(build({root,data:missing}),/画像が見つかりません/);
    assert.equal(await readFile(path.join(result.out,'works/20260529/index.html'),'utf8'),html);
  } finally {await rm(root,{recursive:true,force:true});}
});
test('local manager blocks foreign hosts, unauthenticated writes and private paths',async()=>{
  const server=createManager();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(origin+'/api/draft',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,403);
    assert.equal((await fetch(origin+'/.git/config')).status,404);
    const foreignStatus = await new Promise((resolve,reject)=>{const req=http.get(origin+'/api/data',{headers:{host:'attacker.example'}},res=>{res.resume();resolve(res.statusCode);});req.on('error',reject);});
    assert.equal(foreignStatus,403);
    assert.equal((await fetch(origin+'/')).status,200);
  } finally {await new Promise(resolve=>server.close(resolve));}
});
test('GitHub publication checks remote version before writes and never force-pushes',async()=>{
  const calls=[];
  const request=async(url,options)=>{
    const endpoint=url.split('/moribetakehito/hp/')[1];calls.push({endpoint,...options});
    let result;
    if(endpoint==='git/ref/heads/main')result={object:{sha:'head'}};
    else if(endpoint==='git/commits/head')result={tree:{sha:'old-tree'}};
    else if(endpoint.startsWith('contents/'))result={sha:'expected'};
    else if(endpoint.includes('?recursive'))result={tree:[]};
    else if(endpoint==='git/trees')result={sha:'new-tree'};
    else if(endpoint==='git/commits')result={sha:'new-commit'};
    else if(endpoint==='git/refs/heads/main')result={};
    else throw new Error(endpoint);
    return {ok:true,json:async()=>result};
  };
  const data=sample();data.works[0].images=[];
  await assert.rejects(publish({token:'test-only',data,expected:'outdated',request}),/変わっています/);
  assert.equal(calls.some(c=>c.method!=='GET'),false);
  calls.length=0;
  const result=await publish({token:'test-only',data,expected:'expected',request});
  assert.equal(result.sha,'new-commit');
  const tree=JSON.parse(calls.find(c=>c.endpoint==='git/trees').body);
  assert.equal(tree.base_tree,'old-tree');assert.deepEqual(tree.tree.map(n=>n.path),['works/data.json']);
  assert.deepEqual(JSON.parse(calls.at(-1).body),{sha:'new-commit',force:false});
});
test('browser-auth status never returns credentials; CLI errors are sanitized',async()=>{
  const secret='test-only-oauth-credential';
  const calls=[];
  const auth=createGitHubAuth({locate:async()=>'/test/gh',run:async(file,args,options)=>{calls.push({file,args,options});return {stdout:secret+'\n'};},request:async(url,options)=>{assert.equal(url,'https://api.github.com/user');assert.equal(options.headers.Authorization,`Bearer ${secret}`);return {ok:true,json:async()=>({login:'moribetakehito'})};}});
  assert.deepEqual(await auth.status(),{connected:true,login:'moribetakehito'});
  assert.equal(JSON.stringify(await auth.status()).includes(secret),false);
  assert.equal(calls[0].args.includes(secret),false);
  assert.ok(calls[0].args.includes('moribetakehito'));
  const failing=createGitHubAuth({locate:async()=>'/test/gh',run:async()=>{throw new Error(secret);}});
  await assert.rejects(failing.getToken(),error=>!error.message.includes(secret)&&error.message.includes('接続'));
  assert.deepEqual(await failing.status(),{connected:false});
});
test('inherited environment tokens cannot silently replace browser authentication',()=>{
  for(const name of ['GH_TOKEN','GITHUB_TOKEN','GH_ENTERPRISE_TOKEN','GITHUB_ENTERPRISE_TOKEN','GH_HOST'])assert.equal(authEnvironment()[name],undefined);
});

test('legacy migration preserves every text and image; content is authoritative in mixed order',async()=>{
  const {normalizeData}=await import('../manager/model.js');
  const legacy=sample();legacy.works[0].description='line one\n\nline two';
  const next=normalizeData(legacy),w=next.works[0];
  assert.equal(w.content[0].text,legacy.works[0].description);
  assert.deepEqual(w.images,legacy.works[0].images);
  w.content.push({type:'text',text:'after image',style:'heading'});
  const result=validate(next).works[0];
  assert.deepEqual(result.content.map(b=>b.type),['text','image','text']);
  assert.equal(result.description,'line one\n\nline two\n\nafter image');
  assert.deepEqual(normalizeData(next),normalizeData(normalizeData(next)));
  w.content[1].src='/../secret';assert.throws(()=>validate(next));
});
test('custom tag registry preserves unused tags, merges names, and removes references',async()=>{
  const {normalizeData,renameTag,removeTag}=await import('../manager/model.js');
  let data=normalizeData({...sample(),tags:['  #建築  ','Architecture','未使用']});
  data.works[0].tags=['architecture','展示','展示'];data=normalizeData(data);
  assert.deepEqual(data.tags,['建築','Architecture','未使用','展示']);
  assert.deepEqual(data.works[0].tags,['Architecture','展示']);
  data=renameTag(data,'展示','建築');assert.deepEqual(data.works[0].tags,['Architecture','建築']);
  data=removeTag(data,'建築');assert.deepEqual(data.works[0].tags,['Architecture']);
  assert.ok(data.tags.includes('未使用'));
  data.works[0].info=[{label:'',value:''}];assert.deepEqual(validate(data).works[0].info,[]);
  data.works[0].info=[{label:'構造',value:''}];assert.throws(()=>validate(data),/両方/);
});
test('new layout cannot publish into an incompatible public renderer',async()=>{
  const data=sample();data.works[0].images=[];data.works[0].tags=['建築'];const methods=[];
  const request=async(url,options)=>{methods.push(options.method);let result=url.includes('git/ref/')?{object:{sha:'head'}}:url.includes('git/commits/')?{tree:{sha:'tree'}}:url.includes('work.js')?{content:Buffer.from('old renderer').toString('base64')}:{sha:'expected'};return {ok:true,json:async()=>result};};
  await assert.rejects(publish({token:'test',data,expected:'expected',request}),/新しい作品レイアウト/);
  assert.ok(methods.every(m=>m==='GET'));
});

test('draft accepts incomplete work, backs up legacy draft, and never changes source before apply',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'moribe-draft-'));
  const source=JSON.stringify(sample());
  await mkdir(path.join(root,'works'),{recursive:true});await mkdir(path.join(root,'.manager'),{recursive:true});
  await writeFile(path.join(root,'works/data.json'),source);await writeFile(path.join(root,'.manager/draft.json'),source);await writeFile(path.join(root,'.manager/sync.json'),' {"sha":"fixture"}');
  const server=createManager({root,auth:{status:async()=>({connected:false})}});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${server.address().port}`;
  try{
    const html=await fetch(origin).then(r=>r.text()),token=html.match(/name="manager-token" content="([^"]+)/)[1];
    const data=sample();data.works[0].title='';data.works[0].date='';
    const response=await fetch(origin+'/api/draft',{method:'POST',headers:{'Content-Type':'application/json','X-Manager-Token':token,Origin:origin},body:JSON.stringify({data})});
    assert.equal(response.status,200);assert.equal(await readFile(path.join(root,'works/data.json'),'utf8'),source);
    assert.equal(JSON.parse(await readFile(path.join(root,'.manager/draft.json'),'utf8')).version,2);
    const {readdir}=await import('node:fs/promises');const files=await readdir(path.join(root,'.manager/backups'));
    assert.equal(files.length,1);assert.equal(await readFile(path.join(root,'.manager/backups',files[0]),'utf8'),source);
    const blocked=await fetch(origin+'/api/preview',{method:'POST',headers:{'Content-Type':'application/json','X-Manager-Token':token,Origin:origin},body:JSON.stringify({data})});assert.equal(blocked.status,400);
  }finally{await new Promise(resolve=>server.close(resolve));await rm(root,{recursive:true,force:true});}
});
