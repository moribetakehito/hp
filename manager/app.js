const $ = s => document.querySelector(s);
const token = $('meta[name="manager-token"]').content;
let data = { works: [] }, base, selected = 0, dirty = false, locked = false;
const escape = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function status(text,error=false) { $('#status').textContent = text; $('#status').classList.toggle('error',error); }
async function api(route,input) {
  const response = await fetch('/api/'+route,{method:'POST',headers:{'Content-Type':'application/json','X-Manager-Token':token},body:JSON.stringify(input)});
  const result = await response.json(); if (!response.ok) throw new Error(result.error || '処理に失敗しました。'); return result;
}
async function run(action) {
  if (locked) return;
  locked = true; document.querySelectorAll('button').forEach(b=>b.disabled=true);
  try { await action(); } catch (e) { status(e.message,true); }
  finally { locked = false; document.querySelectorAll('button').forEach(b=>b.disabled=false); }
}
function markDirty() { dirty=true; status('未保存の変更があります。下書きを保存するか、サイト用ファイルに反映してください。'); }
function renderList() {
  $('#count').textContent = data.works.length;
  $('#works').innerHTML = data.works.map((w,i)=>`<button class="work-item ${i===selected?'active':''}" data-select="${i}" ${i===selected?'aria-current="true"':''}><small>${escape(w.date || '日付未入力')}</small><strong>${escape(w.title || '新しい作品')}</strong></button>`).join('');
  document.querySelectorAll('[data-select]').forEach(b=>b.onclick=()=>{selected=Number(b.dataset.select);render();});
}
function field(key,label,placeholder='',hint='',area=false) {
  const w = data.works[selected];
  return `<div class="field"><label for="f-${key}">${label}</label>${area?`<textarea id="f-${key}" data-field="${key}" rows="6" placeholder="${escape(placeholder)}">${escape(w[key])}</textarea>`:`<input id="f-${key}" data-field="${key}" value="${escape(w[key])}" placeholder="${escape(placeholder)}" ${key==='date'?'spellcheck="false" class="mono" inputmode="numeric" maxlength="8"':''}>`}${hint?`<p class="hint">${hint}</p>`:''}</div>`;
}
function renderImages() {
  const work = data.works[selected];
  $('#images').innerHTML = work.images.map((src,i)=>`<div class="image-card"><img src="${escape(src)}" alt="画像 ${i+1}" loading="lazy"><div class="image-controls"><button data-image-up="${i}" aria-label="画像${i+1}を前へ">←</button><button data-image-down="${i}" aria-label="画像${i+1}を後ろへ">→</button><button data-image-remove="${i}" aria-label="画像${i+1}を取り除く">削除</button></div><p>${i+1}. ${escape(src.split('/').pop())}</p></div>`).join('') || '<p class="hint">画像はまだありません。下のボタンから追加できます。</p>';
  document.querySelectorAll('[data-image-up]').forEach(b=>b.onclick=()=>moveImage(Number(b.dataset.imageUp),-1));
  document.querySelectorAll('[data-image-down]').forEach(b=>b.onclick=()=>moveImage(Number(b.dataset.imageDown),1));
  document.querySelectorAll('[data-image-remove]').forEach(b=>b.onclick=()=>{work.images.splice(Number(b.dataset.imageRemove),1);markDirty();renderImages();});
}
function moveImage(i,delta) { const images=data.works[selected].images,j=i+delta; if(j<0||j>=images.length)return; [images[i],images[j]]=[images[j],images[i]];markDirty();renderImages(); }
function render() {
  renderList();
  const w = data.works[selected];
  $('#editor-heading').textContent=w ? `作品 ${w.date || '日付未入力'} を編集`:'作品を追加';
  if(!w) { $('#editor').innerHTML='<div class="empty">「作品を追加」から最初の作品を作成できます。</div>'; return; }
  $('#editor').innerHTML=`<div class="card"><div class="card-title"><h3>基本情報</h3><span>01 / INFORMATION</span></div>${field('date','日付 *','20261102','YYYYMMDD形式の8桁。作品IDとURLはこの日付から自動で決まります。1日につき1作品です。')}${field('title','タイトル *','作品のタイトル')}<p id="url-hint" class="hint mono"></p></div><div class="card"><div class="card-title"><h3>作品の説明</h3><span>02 / DESCRIPTION</span></div>${field('venue','会場・場所','展示会場など')}${field('subtitle','サブタイトル','展示名など')}${field('description','本文','作品の説明を入力','リンクは [表示する文字](https://example.com) と書けます。',true)}</div><div class="card"><div class="card-title"><h3>画像と並び順</h3><span>03 / IMAGES</span></div><div id="images" class="images"></div><label class="upload">＋ 画像を選んで追加<br>PNG / JPEG / WebP / GIF<input type="file" id="upload" accept="image/png,image/jpeg,image/webp,image/gif" multiple></label><p class="hint">矢印で表示順を変更できます。「削除」はこの作品からの参照を外します。元の画像ファイルは残ります。</p></div><div class="bottom-actions"><p class="hint">作品は日付の新しい順に表示します。</p><button id="remove" class="danger">作品を削除</button></div>`;
  $('#url-hint').textContent=`/works/${w.id}/`;
  document.querySelectorAll('[data-field]').forEach(el=>el.oninput=()=>{w[el.dataset.field]=el.value;markDirty();if(el.dataset.field==='date'){w.id=w.date;$('#url-hint').textContent=`/works/${w.date}/`;}if(['title','date'].includes(el.dataset.field)){renderList();$('#editor-heading').textContent=`作品 ${w.date || '日付未入力'} を編集`;}});
  $('#remove').onclick=()=>{if(confirm(`「${w.title || '新しい作品'}」を一覧から削除しますか？ 元の画像は残ります。`)){data.works.splice(selected,1);selected=Math.max(0,selected-1);markDirty();render();}};
  $('#upload').onchange=e=>run(async()=>{
    const files=[...e.target.files];if(!files.length)return;
    status('画像を読み込んでいます…');
    const encoded=await Promise.all(files.map(file=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(new Error('画像を読み込めませんでした。'));reader.onload=()=>resolve({base64:reader.result.split(',')[1]});reader.readAsDataURL(file);}))); 
    const result=await api('upload',{files:encoded});w.images.push(...result.files);markDirty();renderImages();status('画像を追加しました。下書き保存または反映を行ってください。');e.target.value='';
  });
  renderImages();
}
$('#add').onclick=()=>{const day=new Date().toLocaleDateString('sv-SE').replaceAll('-','');if(data.works.some(w=>w.date===day)){status('今日の日付の作品がすでにあります。既存の作品を編集するか、新しい作品の日付を変更してください。',true);}data.works.unshift({id:day,date:day,title:'',venue:'',subtitle:'',description:'',images:[]});selected=0;markDirty();render();$('#f-title').focus();};
$('#draft').onclick=()=>run(async()=>{await api('draft',{data});dirty=false;status(`下書きを保存しました（${new Date().toLocaleTimeString('ja-JP')}）。サイト用ファイルは変更していません。`);});
$('#preview').onclick=()=>run(async()=>{status('プレビューを作成しています…');await api('preview',{data});$('#preview-panel').hidden=false;$('#preview-frame').src=data.works[selected]?`/works/${encodeURIComponent(data.works[selected].id)}/?preview=${Date.now()}`:'/works/';status('プレビューを更新しました。現在編集中の内容を表示しています。');});
$('#close-preview').onclick=()=>{$('#preview-panel').hidden=true;};
async function apply(confirmDelete=false) { await run(async()=>{status('画像とデータを確認して反映しています…');const result=await api('apply',{data,base,confirmDelete});data=result.data;base=structuredClone(result.data);dirty=false;render();status('このMacのサイト用ファイルに反映しました。_siteにGitHub Pages用ファイルも生成しました。公開サイトへの送信はまだ行っていません。');}); }
$('#apply').onclick=()=>{const deleted=base.works.filter(w=>!data.works.some(n=>n.id===w.id));if(deleted.length){$('#confirm-text').textContent=`次の作品がサイト用データから削除されます。\n\n${deleted.map(w=>w.title).join('\n')}\n\n変更前のデータはMac内にバックアップします。`;$('#confirm-dialog').showModal();}else apply();};
$('#cancel-delete').onclick=()=>$('#confirm-dialog').close();$('#confirm-delete').onclick=()=>{$('#confirm-dialog').close();apply(true);};
$('#publish').onclick=()=>{if(dirty){status('先に変更をサイト用ファイルに反映してください。',true);return;}$('#github-token').value='';$('#publish-dialog').showModal();};
$('#cancel-publish').onclick=()=>{$('#github-token').value='';$('#publish-dialog').close();};
$('#publish-dialog').addEventListener('cancel',()=>{$('#github-token').value='';});
$('#confirm-publish').onclick=()=>{const credential=$('#github-token').value;$('#github-token').value='';$('#publish-dialog').close();run(async()=>{status('GitHubの最新状態を確認して送信しています…');const result=await api('publish',{data,token:credential});status(result.unchanged?'GitHubと同じ内容です。送信する変更はありません。':`GitHubに保存しました（${result.sha.slice(0,7)}）。公開処理の完了はGitHub Actionsで確認してください。`);});};
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
try{const result=await fetch('/api/data').then(r=>r.json());base=result.source;data=structuredClone(result.draft || result.source);data.works.forEach(w=>{w.id=w.date;delete w.number;delete w.url;});data.works.sort((a,b)=>b.date.localeCompare(a.date));render();status(result.draft?'保存済みの下書きを読み込みました。公開サイトへの送信は行っていません。':'GitHubから取得した作品データを読み込みました。作品を選んで編集できます。');}catch(e){status('データを読み込めませんでした。管理アプリを再起動してください。',true);}
