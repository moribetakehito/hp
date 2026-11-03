import { readFile, writeFile, mkdir, cp, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseWorkDate, compareWorkDates } from '../manager/date.js';
import { normalizeData } from '../manager/model.js';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export function validate(data) {
  data=normalizeData(data);
  const ids = new Set();
  return {version:2,tags:data.tags,works: data.works.map((w) => {
    if (!w || typeof w !== 'object') throw new Error('作品の形式が正しくありません。');
    parseWorkDate(w.date);
    if (ids.has(w.date)) throw new Error(`「${w.date}」の作品が重複しています。同じ日付には_1、_2のように枝番を付けてください。`);
    ids.add(w.date);
    const result = { id: w.date, date: w.date };
    for (const key of ['title', 'venue', 'subtitle', 'description']) {
      if (w[key] != null && typeof w[key] !== 'string') throw new Error(`${w.id}: ${key}は文字列で入力してください。`);
      result[key] = w[key] || '';
    }
    if (!result.title.trim()) throw new Error(`${w.id}: タイトルを入力してください。`);
    if (!Array.isArray(w.images) || w.images.some(s => typeof s !== 'string' || !/^\/(?!\/)/.test(s) || s.includes('..') || /[<>"\\\x00-\x1f]/.test(s))) throw new Error(`${w.id}: 画像はサイト内のパスを指定してください。`);
    result.images = [...w.images];
    result.tags=[...w.tags];
    result.info=w.info.filter(row=>row.label.trim() || row.value.trim()).map(row=>{
      if(!row.label.trim() || !row.value.trim())throw new Error(`${w.date}: 諸情報は項目名と値の両方を入力してください。`);
      return {label:row.label.trim(),value:row.value.trim()};
    });
    if(w.content.length>500)throw new Error('本文ブロックは500件以内にしてください。');
    result.content=w.content.map(b=>({...b}));
    // Existing optional link/asset settings must survive editing.
    for (const key of ['assetBase']) if (w[key] != null) {
      if (typeof w[key] !== 'string' || !/^\/(?!\/)/.test(w[key]) || w[key].includes('..')) throw new Error(`${w.id}: ${key}が正しくありません。`);
      result[key] = w[key];
    }
    return result;
  }).sort((a,b) => compareWorkDates(a.date,b.date)) };
}
const escape = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
export async function build({ root = ROOT, out = path.join(root, '_site'), data, assetRoot = root } = {}) {
  data = validate(data || JSON.parse(await readFile(path.join(root, 'works/data.json'), 'utf8')));
  out = path.resolve(out);
  if (out === path.resolve(root) || !out.startsWith(path.resolve(root) + path.sep)) throw new Error('出力先はサイト内の専用フォルダにしてください。');
  // Validate before clearing the previous preview.
  for (const work of data.works) for (const src of work.images) {
    const file = path.join(assetRoot, src.slice(1));
    const fallback = path.join(root, src.slice(1));
    if (!(await stat(file).catch(() => null))?.isFile() && !(await stat(fallback).catch(() => null))?.isFile()) throw new Error(`画像が見つかりません: ${src}`);
  }
  const template = await readFile(path.join(root, 'works/work/index.html'), 'utf8');
  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });
  // Explicit list prevents drafts, Git metadata and the retired CMS entering Pages.
  for (const name of ['index.html', 'stylesheet.css', 'favicon.png', 'portrait.jpg', 'about', 'portfolio', 'works']) {
    await cp(path.join(root, name), path.join(out, name), { recursive: true });
  }
  if (assetRoot !== root) {
    const uploads = path.join(assetRoot, 'works/uploads');
    if (await stat(uploads).catch(() => null)) await cp(uploads, path.join(out, 'works/uploads'), { recursive: true });
  }
  await writeFile(path.join(out, 'works/data.json'), JSON.stringify(data, null, 2) + '\n');
  for (const work of data.works) {
    const dir = path.join(out, 'works', work.id);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'index.html'), template.replace('<title>work - moribe takehito</title>', `<title>${escape(work.title)} - moribe takehito</title>`).replace('data-work-detail>', `data-work-detail data-work-id="${escape(work.id)}">`));
  }
  // Static alternatives to Netlify's legacy redirects.
  const redirects = { 'portfolio.html': '/portfolio/', 'about.html': '/about/', 'works/works.html': '/works/', 'works/20260511_cp.html': '/works/20260511/', 'works/20260511_cp/p.html': '/works/20260511/' };
  for (const [file, target] of Object.entries(redirects)) {
    await mkdir(path.dirname(path.join(out, file)), { recursive: true });
    await writeFile(path.join(out, file), `<!doctype html><html lang="ja"><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${target}"><link rel="canonical" href="${target}"><title>移動します</title><a href="${target}">移動先を開く</a></html>`);
  }
  await writeFile(path.join(out, '.nojekyll'), '');
  await writeFile(path.join(out, 'CNAME'), 'moribetakehito.com\n');
  return { works: data.works.length, out };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(await build());
}
