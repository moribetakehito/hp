import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { ROOT, validate } from './build.mjs';

const repo = 'moribetakehito/hp';
export const blobHash = bytes => createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
export async function publish({ token, data, expected, root=ROOT, request = fetch }) {
  if (typeof token !== 'string' || !token.trim()) throw new Error('GitHubへの接続が必要です。ブラウザ認証を完了してください。');
  data = validate(data);
  async function github(endpoint, method='GET', body) {
    const response = await request(`https://api.github.com/repos/${repo}/${endpoint}`, { method, headers: { Authorization:`Bearer ${token.trim()}`, Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json' }, ...(body ? {body:JSON.stringify(body)} : {}), signal:AbortSignal.timeout(60000) });
    if (!response.ok) {
      if ([401,403].includes(response.status)) throw new Error('GitHubに保存できません。「GitHubに接続」から再認証し、hpリポジトリへの書き込み権限を確認してください。');
      if ([409,422].includes(response.status)) throw new Error('GitHub側で更新が競合しました。再読み込みして変更内容を確認してください。');
      throw new Error(`GitHubへの接続に失敗しました（${response.status}）。再送前にリポジトリの更新履歴を確認してください。`);
    }
    return response.json();
  }
  const head = await github('git/ref/heads/main');
  const commit = await github(`git/commits/${head.object.sha}`);
  const current = await github(`contents/works/data.json?ref=${head.object.sha}`);
  // Compare with the version loaded before editing; never overwrite someone else's update.
  if (current.sha !== expected) throw new Error('GitHubの作品データが、このアプリで読み込んだ時点から変わっています。最新データを取得してから再度編集してください。');
  const advanced=data.works.some(w=>w.tags.length||w.info.length||w.content.some((b,i)=>b.type==='text'&&(i>0||b.style==='heading')||b.type==='image'&&(b.caption||b.alt||b.width!=='full'||b.align!=='center')));
  if(advanced){
    const renderer=await github(`contents/works/work.js?ref=${head.object.sha}`);
    if(!renderer.content || !Buffer.from(renderer.content,'base64').toString().includes('WORK_CONTENT_V2'))throw new Error('公開サイトを新しい作品レイアウトに対応させてから送信してください。下書き保存とプレビューは利用できます。');
  }
  const tree = [{ path:'works/data.json', mode:'100644', type:'blob', content:JSON.stringify(data,null,2)+'\n' }];
  const paths = new Set(data.works.flatMap(w=>w.images));
  const existing = await github(`git/trees/${commit.tree.sha}?recursive=1`);
  if (existing.truncated) throw new Error('リポジトリの画像一覧をすべて取得できませんでした。公開を中止しました。');
  const indexed = new Map(existing.tree.filter(n=>n.type==='blob').map(n=>[n.path,n.sha]));
  for (const src of paths) {
    const relative=src.slice(1);
    const bytes=await readFile(path.join(root,relative));
    if (indexed.get(relative) === blobHash(bytes)) continue;
    if (!relative.startsWith('works/uploads/')) throw new Error('既存作品の画像が変更されています。GitHub側とローカルを確認してください。');
    const blob = await github('git/blobs','POST',{content:bytes.toString('base64'),encoding:'base64'});
    tree.push({path:relative,mode:'100644',type:'blob',sha:blob.sha});
  }
  const nextTree = await github('git/trees','POST',{base_tree:commit.tree.sha,tree});
  if (nextTree.sha === commit.tree.sha) return {unchanged:true,sha:head.object.sha,dataSha:current.sha};
  const next = await github('git/commits','POST',{message:'Update works from Site Manager',tree:nextTree.sha,parents:[head.object.sha]});
  await github('git/refs/heads/main','PATCH',{sha:next.sha,force:false});
  const bytes=Buffer.from(JSON.stringify(data,null,2)+'\n');
  return {sha:next.sha,dataSha:blobHash(bytes),url:`https://github.com/${repo}/commit/${next.sha}`};
}
