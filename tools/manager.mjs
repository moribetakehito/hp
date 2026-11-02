import http from 'node:http';
import { readFile, writeFile, mkdir, copyFile, rename, stat } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { ROOT, validate, build } from './build.mjs';
import { publish, blobHash } from './publish.mjs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const state = path.join(ROOT, '.manager');
const staged = path.join(state, 'staged');
const token = randomBytes(32).toString('hex');
const mime = { '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.webp':'image/webp', '.gif':'image/gif', '.ico':'image/x-icon' };
let busy = false;
let previewReady = false;
const send = (res, code, data) => { res.writeHead(code, {'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store'}); res.end(JSON.stringify(data)); };
async function body(req, limit = 32 * 1024 * 1024) {
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > limit) throw new Error('ファイルが大きすぎます。画像は合計24MB程度までで追加してください。'); chunks.push(chunk); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
async function atomic(file, content) { await mkdir(path.dirname(file), {recursive:true}); await writeFile(file + '.tmp', content); await rename(file + '.tmp', file); }
const json = d => JSON.stringify(d, null, 2) + '\n';
async function getData() {
  const source = JSON.parse(await readFile(path.join(ROOT,'works/data.json'),'utf8'));
  const draft = await readFile(path.join(state,'draft.json'),'utf8').then(JSON.parse).catch(() => null);
  const synced = await readFile(path.join(state,'sync.json'),'utf8').then(JSON.parse).catch(() => null);
  let expected = synced?.sha;
  if (!expected) {
    const git = process.env.MANAGER_GIT || (await stat(path.join(process.env.HOME || '', '.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback/git')).catch(()=>null) ? path.join(process.env.HOME,'.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback/git') : 'git');
    const result = await promisify(execFile)(git,['show','HEAD:works/data.json'],{cwd:ROOT,encoding:'buffer'});
    expected = blobHash(result.stdout);
  }
  return { source, draft, expected };
}
function imageExtension(buffer) {
  if (buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return '.png';
  if (buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255) return '.jpg';
  if (['GIF87a','GIF89a'].includes(buffer.subarray(0,6).toString())) return '.gif';
  if (buffer.subarray(0,4).toString() === 'RIFF' && buffer.subarray(8,12).toString() === 'WEBP') return '.webp';
  throw new Error('PNG・JPEG・WebP・GIFの画像を選んでください。');
}
async function serveFile(res, root, pathname) {
  if (pathname.split('/').some(s => s.startsWith('.') || s === 'tools' || s === 'manager')) { res.writeHead(404); res.end(); return; }
  let file = path.resolve(root, '.' + pathname);
  if (!file.startsWith(root + path.sep) && file !== root) throw new Error('不正なパスです。');
  if ((await stat(file).catch(() => null))?.isDirectory()) file = path.join(file,'index.html');
  const bytes = await readFile(file).catch(() => null);
  if (!bytes) { res.writeHead(404); res.end('Not found'); return; }
  const output = path.extname(file)==='.html' ? bytes.toString('utf8').replaceAll('href="/"','href="/?site-preview=1"') : bytes;
  res.writeHead(200, {'Content-Type':mime[path.extname(file)] || 'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}); res.end(output);
}
export function createManager() {
  return http.createServer(async (req, res) => {
    res.setHeader('X-Frame-Options','SAMEORIGIN');
    res.setHeader('Referrer-Policy','no-referrer');
    try {
      const host = req.headers.host;
      if (!host || !/^127\.0\.0\.1:\d+$/.test(host)) { send(res,403,{error:'ローカルアドレスで開いてください。'}); return; }
      const url = new URL(req.url, `http://${host}`);
      const route = decodeURIComponent(url.pathname);
      if (req.method === 'GET' && route === '/' && url.searchParams.has('site-preview')) {
        await serveFile(res,previewReady ? path.join(state,'preview') : ROOT,'/'); return;
      }
      if (req.method === 'GET' && route === '/') {
        const html = (await readFile(path.join(ROOT,'manager/index.html'),'utf8')).replace('__TOKEN__',token);
        res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}); res.end(html); return;
      }
      if (req.method === 'GET' && ['/app.js','/style.css','/date.js'].includes(route)) { await serveFile(res,path.join(ROOT,'manager'),route); return; }
      if (req.method === 'GET' && route === '/api/data') { send(res,200,await getData()); return; }
      if (req.method === 'GET' && route.startsWith('/preview/')) {
        if (!previewReady) { res.writeHead(404); res.end('プレビューを作成してください。'); return; }
        res.writeHead(302,{Location:route.slice('/preview'.length)}); res.end(); return;
      }
      if (req.method === 'GET' && route.startsWith('/works/uploads/')) {
        const stagedFile = path.join(staged,route.slice(1));
        if ((await stat(stagedFile).catch(() => null))?.isFile()) { await serveFile(res,staged,route); return; }
      }
      if (req.method === 'GET' && !route.startsWith('/api/')) { await serveFile(res,previewReady ? path.join(state,'preview') : ROOT,route); return; }
      if (req.method !== 'POST' || !route.startsWith('/api/')) { send(res,404,{error:'見つかりません。'}); return; }
      if (req.headers['x-manager-token'] !== token || req.headers.origin && req.headers.origin !== `http://${host}`) { send(res,403,{error:'この画面から操作してください。'}); return; }
      if (busy) { send(res,409,{error:'別の保存処理が進んでいます。少し待ってください。'}); return; }
      busy = true;
      try {
        const input = await body(req);
        if (route === '/api/upload') {
          const files = [];
          if (!Array.isArray(input.files) || input.files.length > 50) throw new Error('画像は50枚までで追加してください。');
          for (const f of input.files) {
            if (typeof f.base64 !== 'string') throw new Error('画像が読み込めませんでした。');
            const bytes = Buffer.from(f.base64,'base64');
            const extension = imageExtension(bytes);
            const name = `${Date.now()}-${randomBytes(6).toString('hex')}${extension}`;
            const relative = `/works/uploads/${name}`;
            await atomic(path.join(staged,relative.slice(1)),bytes);
            files.push(relative);
          }
          send(res,200,{files});
        } else if (route === '/api/draft') {
          const data = validate(input.data);
          await atomic(path.join(state,'draft.json'),json(data));
          send(res,200,{ok:true,savedAt:new Date().toISOString()});
        } else if (route === '/api/preview') {
          const data = validate(input.data);
          await build({data,out:path.join(state,'preview'),assetRoot:staged});
          previewReady = true;
          send(res,200,{ok:true,url:'/works/'});
        } else if (route === '/api/publish') {
          const source = JSON.parse(await readFile(path.join(ROOT,'works/data.json'),'utf8'));
          if (JSON.stringify(validate(input.data)) !== JSON.stringify(validate(source))) throw new Error('先に「サイト用ファイルに反映」を実行してください。');
          const {expected} = await getData();
          const result = await publish({token:input.token,data:source,expected});
          await atomic(path.join(state,'sync.json'),json({sha:result.dataSha}));
          send(res,200,result);
        } else if (route === '/api/apply') {
          const data = validate(input.data);
          const currentText = await readFile(path.join(ROOT,'works/data.json'),'utf8');
          const current = JSON.parse(currentText);
          if (JSON.stringify(input.base) !== JSON.stringify(current)) { send(res,409,{error:'元データが別の操作で変わりました。画面を再読み込みして確認してください。'}); return; }
          const deleted = current.works.filter(w => !data.works.some(n => n.id === w.id));
          if (deleted.length && !input.confirmDelete) { send(res,409,{error:'削除される作品の確認が必要です。'}); return; }
          // Build first: a missing image must never replace valid source data.
          await build({data,out:path.join(state,'preview'),assetRoot:staged});
          previewReady = true;
          for (const work of data.works) for (const src of work.images) {
            const file = path.join(staged,src.slice(1));
            if ((await stat(file).catch(() => null))?.isFile()) {
              await mkdir(path.dirname(path.join(ROOT,src.slice(1))),{recursive:true});
              await copyFile(file,path.join(ROOT,src.slice(1)));
            }
          }
          await atomic(path.join(state,'backups',`${Date.now()}.json`),currentText);
          await atomic(path.join(ROOT,'works/data.json'),json(data));
          await atomic(path.join(state,'draft.json'),json(data));
          await build();
          send(res,200,{ok:true,data});
        } else send(res,404,{error:'見つかりません。'});
      } finally { busy = false; }
    } catch (error) { send(res,400,{error:error.message}); }
  });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = createManager();
  server.listen(Number(process.env.PORT || 4318),'127.0.0.1',() => {
    const url=`http://127.0.0.1:${server.address().port}`;
    console.log(`Manager: ${url}`);
    if (process.argv.includes('--open') && process.platform==='darwin') execFile('open',[url]);
  });
}
