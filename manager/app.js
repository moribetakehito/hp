import { normalizeData, cleanTag, renameTag, removeTag } from '/model.js';
import { compareWorkDates, nextWorkDate } from '/date.js';
const $ = s => document.querySelector(s);
const token = $('meta[name="manager-token"]').content;
let data = { works: [], tags: [] }, base, selected = 0, dirty = false, locked = false;
let undoState, insertAt=0, search='';
function checkpoint(){undoState=structuredClone(data);}
function changed(){markDirty();render();}
function moveBlock(i,delta){const a=data.works[selected].content,j=i+delta;if(j<0||j>=a.length)return;checkpoint();[a[i],a[j]]=[a[j],a[i]];changed();}
function addBlock(type,index){checkpoint();data.works[selected].content.splice(index,0,type==='text'?{type:'text',text:'',style:'body'}:{type:'image',src:'',alt:'',caption:'',width:'full',align:'center'});changed();}
const escape = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function status(text,error=false) { $('#status').textContent = text; $('#status').classList.toggle('error',error); }
async function api(route,input) {
  const response = await fetch('/api/'+route,{method:'POST',headers:{'Content-Type':'application/json','X-Manager-Token':token},body:JSON.stringify(input)});
  const result = await response.json(); if (!response.ok) throw new Error(result.error || '処理に失敗しました。'); return result;
}
async function run(action) {
  if (locked) return;
  locked = true; const buttons=new Map([...document.querySelectorAll('button,input,textarea,select')].map(b=>[b,b.disabled])); buttons.forEach((_,b)=>b.disabled=true);
  try { await action(); } catch (e) { status(e.message,true); }
  finally { locked = false; buttons.forEach((disabled,b)=>{if(b.isConnected)b.disabled=disabled;}); }
}
function markDirty() { dirty=true; status('未保存の変更があります。下書きを保存するか、サイト用ファイルに反映してください。'); }
function renderList() {
  $('#count').textContent = data.works.length;
  $('#works').innerHTML = data.works.map((w,i)=>({w,i})).filter(({w})=>(!search||[w.date,w.title,w.subtitle,w.venue,...w.tags].join(' ').toLocaleLowerCase().includes(search))).map(({w,i})=>`<button class="work-item ${i===selected?'active':''}" data-select="${i}" ${i===selected?'aria-current="true"':''}><small>${escape(w.date || '日付未入力')}</small><strong>${escape(w.title || '新しい作品')}</strong></button>`).join('');
  document.querySelectorAll('[data-select]').forEach(b=>b.onclick=()=>{selected=Number(b.dataset.select);render();});
}
function field(key,label,placeholder='',hint='',area=false) {
  const w = data.works[selected];
  return `<div class="field"><label for="f-${key}">${label}</label>${area?`<textarea id="f-${key}" data-field="${key}" rows="6" placeholder="${escape(placeholder)}">${escape(w[key])}</textarea>`:`<input id="f-${key}" data-field="${key}" value="${escape(w[key])}" placeholder="${escape(placeholder)}" ${key==='date'?'spellcheck="false" class="mono" maxlength="15"':''}>`}${hint?`<p class="hint">${hint}</p>`:''}</div>`;
}
function render() {
  renderList();
  const w=data.works[selected];
  $('#editor-heading').textContent=w ? w.title || '新しい作品' : '作品を追加';
  if(!w){$('#editor').innerHTML='<div class="empty">「作品を追加」から作品を作成できます。</div>';return;}
  const insertion=i=>`<div class="insert"><button data-text="${i}">＋ テキスト</button><button data-upload="${i}">＋ 画像</button><button data-library="${i}">保存済み画像</button></div>`;
  $('#editor').innerHTML=`<nav class="editor-nav" aria-label="編集セクション"><a href="#basic-section">基本情報</a><a href="#tag-section">タグ</a><a href="#info-section">諸情報</a><a href="#content-section">本文と画像</a></nav><div class="card" id="basic-section"><div class="card-title"><h3>基本情報</h3><span>01 / INFORMATION</span></div>${field('date','日付・枝番 *','20261103 または 20261103_1','日付が作品IDになります。同日の作品には _1、_2 を付けられます。')}${field('title','タイトル *','作品のタイトル')}${field('subtitle','サブタイトル')}${field('venue','会場・場所・敷地')}<p id="url-hint" class="hint mono">/works/${escape(w.date)}/</p></div>
  <div class="card" id="tag-section"><div class="card-title"><h3>タグ</h3><button id="manage-tags">タグを管理</button></div><p class="hint">クリックして選択・解除。新しいタグは下の欄から追加できます。</p><div class="tag-options">${data.tags.map(t=>`<button class="tag ${w.tags.includes(t)?'chosen':''}" data-tag="${escape(t)}" aria-pressed="${w.tags.includes(t)}">${escape(t)}</button>`).join('')||'<span class="hint">タグはまだありません。</span>'}</div><form id="tag-form" class="inline-form"><input id="new-tag" aria-label="タグ名" placeholder="タグ名を入力" list="tag-suggestions"><datalist id="tag-suggestions">${data.tags.map(t=>`<option value="${escape(t)}">`).join('')}</datalist><button>追加して選択</button></form></div>
  <div class="card" id="info-section"><div class="card-title"><h3>諸情報</h3><button id="add-info">＋ 項目を追加</button></div><p class="hint">必要な項目だけ自由に記入できます。空欄の行は公開されません。</p><datalist id="info-suggestions">${['用途','所在地','構造','規模','敷地面積','建築面積','延床面積','設計期間','竣工','共同制作','担当','撮影'].map(t=>`<option value="${t}">`).join('')}</datalist>${w.info.map((r,i)=>`<div class="info-row"><input data-info="${i}" data-key="label" list="info-suggestions" aria-label="項目名 ${i+1}" placeholder="項目名（構造など）" value="${escape(r.label)}"><input data-info="${i}" data-key="value" aria-label="内容 ${i+1}" placeholder="内容" value="${escape(r.value)}"><button data-info-remove="${i}" aria-label="項目 ${i+1} を削除">×</button></div>`).join('')}</div>
  <div class="card content-card" id="content-section"><div class="card-title"><div><h3>本文と画像</h3><p class="hint">追加した順に公開されます。矢印で順番を変更できます。</p></div><button id="undo" ${undoState?'':'disabled'}>ひとつ戻す</button></div>${insertion(0)}${w.content.map((b,i)=>`<article class="block"><div class="block-bar"><span>${String(i+1).padStart(2,'0')} / ${b.type==='text'?'TEXT':'IMAGE'}</span><div><button data-up="${i}" aria-label="ブロック ${i+1} を上へ" ${i===0?'disabled':''}>↑</button><button data-down="${i}" aria-label="ブロック ${i+1} を下へ" ${i===w.content.length-1?'disabled':''}>↓</button><button data-remove="${i}">削除</button></div></div>${b.type==='text'?`<label class="field">表示<select data-block="${i}" data-key="style"><option value="body" ${b.style==='body'?'selected':''}>本文</option><option value="heading" ${b.style==='heading'?'selected':''}>見出し</option></select></label><textarea data-block="${i}" data-key="text" rows="7" aria-label="テキスト ${i+1}" placeholder="文章を入力してください">${escape(b.text)}</textarea><p class="hint">リンクは [表示する文字](https://example.com) と書けます。</p>`:`<div class="block-image"><img src="${escape(b.src)}" alt="${escape(b.alt)}" loading="lazy"></div><label class="field">キャプション<input data-block="${i}" data-key="caption" value="${escape(b.caption)}" placeholder="画像の下に表示する説明"></label><label class="field">画像の説明（読み上げ用）<input data-block="${i}" data-key="alt" value="${escape(b.alt)}"></label><div class="info-row"><label>画像の幅<select data-block="${i}" data-key="width">${[['full','全幅'],['medium','中'],['small','小']].map(([v,l])=>`<option value="${v}" ${b.width===v?'selected':''}>${l}</option>`).join('')}</select></label><label>配置<select data-block="${i}" data-key="align">${[['left','左'],['center','中央'],['right','右']].map(([v,l])=>`<option value="${v}" ${b.align===v?'selected':''}>${l}</option>`).join('')}</select></label></div>`}</article>${insertion(i+1)}`).join('')}<input type="file" id="upload" accept="image/png,image/jpeg,image/webp,image/gif" multiple hidden></div><div class="bottom-actions"><p class="hint">文章と画像は、好きな数だけ追加できます。</p><button id="remove" class="danger">作品を削除</button></div>`;
  document.querySelectorAll('[data-field]').forEach(el=>el.oninput=()=>{w[el.dataset.field]=el.value;if(el.dataset.field==='date'){w.id=w.date;$('#url-hint').textContent=`/works/${w.date}/`;}markDirty();renderList();$('#editor-heading').textContent=w.title||'新しい作品';});
  document.querySelectorAll('[data-tag]').forEach(el=>el.onclick=()=>{checkpoint();const t=el.dataset.tag;w.tags=w.tags.includes(t)?w.tags.filter(x=>x!==t):[...w.tags,t];changed();});
  $('#tag-form').onsubmit=e=>{e.preventDefault();const t=cleanTag($('#new-tag').value);if(!t)return;if(t.length>60){status('タグは60文字以内で入力してください。',true);return;}checkpoint();const existing=data.tags.find(x=>x.toLocaleLowerCase()===t.toLocaleLowerCase())||t;if(!data.tags.includes(existing))data.tags.push(existing);if(!w.tags.includes(existing))w.tags.push(existing);changed();};
  $('#manage-tags').onclick=()=>{const dialog=$('#tags-dialog');$('#tag-management').innerHTML=data.tags.map(t=>`<div class="info-row"><span>${escape(t)}</span><button data-rename-tag="${escape(t)}">名前変更</button><button data-delete-tag="${escape(t)}">削除</button></div>`).join('')||'<p>まだタグがありません。</p>';dialog.showModal();document.querySelectorAll('[data-rename-tag]').forEach(el=>el.onclick=()=>{const name=prompt('新しいタグ名を入力してください。同名のタグがある場合は統合します。',el.dataset.renameTag);if(name===null||!cleanTag(name))return;try{checkpoint();data=renameTag(data,el.dataset.renameTag,name);dialog.close();changed();}catch(e){status(e.message,true);}});document.querySelectorAll('[data-delete-tag]').forEach(el=>el.onclick=()=>{if(confirm(`「${el.dataset.deleteTag}」をすべての作品から外し、タグ一覧から削除しますか？`)){checkpoint();data=removeTag(data,el.dataset.deleteTag);dialog.close();changed();}});};
  $('#add-info').onclick=()=>{checkpoint();w.info.push({label:'',value:''});changed();};
  document.querySelectorAll('[data-info]').forEach(el=>el.oninput=()=>{w.info[Number(el.dataset.info)][el.dataset.key]=el.value;markDirty();});
  document.querySelectorAll('[data-info-remove]').forEach(el=>el.onclick=()=>{checkpoint();w.info.splice(Number(el.dataset.infoRemove),1);changed();});
  document.querySelectorAll('[data-block]').forEach(el=>el.oninput=()=>{w.content[Number(el.dataset.block)][el.dataset.key]=el.value;markDirty();});
  document.querySelectorAll('[data-text]').forEach(el=>el.onclick=()=>addBlock('text',Number(el.dataset.text)));
  document.querySelectorAll('[data-upload]').forEach(el=>el.onclick=()=>{insertAt=Number(el.dataset.upload);$('#upload').click();});
  document.querySelectorAll('[data-up]').forEach(el=>el.onclick=()=>moveBlock(Number(el.dataset.up),-1));
  document.querySelectorAll('[data-down]').forEach(el=>el.onclick=()=>moveBlock(Number(el.dataset.down),1));
  document.querySelectorAll('[data-remove]').forEach(el=>el.onclick=()=>{checkpoint();w.content.splice(Number(el.dataset.remove),1);changed();});
  $('#undo').onclick=()=>{if(undoState){const old=data;data=undoState;undoState=old;selected=Math.min(selected,data.works.length-1);changed();}};
  document.querySelectorAll('[data-library]').forEach(el=>el.onclick=()=>run(async()=>{insertAt=Number(el.dataset.library);const result=await api('media',{});$('#media-list').innerHTML=result.images.map(m=>`<button data-media="${escape(m.src)}"><img src="${escape(m.src)}" alt=""><span>${escape(m.name)}</span></button>`).join('')||'<p>保存済み画像はまだありません。</p>';$('#media-dialog').showModal();document.querySelectorAll('[data-media]').forEach(b=>b.onclick=()=>{checkpoint();w.content.splice(insertAt,0,{type:'image',src:b.dataset.media,alt:'',caption:'',width:'full',align:'center'});$('#media-dialog').close();changed();});}));
  $('#upload').onchange=e=>run(async()=>{const files=[...e.target.files];if(!files.length)return;status('画像を読み込んでいます…');const encoded=await Promise.all(files.map(file=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(new Error('画像を読み込めませんでした。'));reader.onload=()=>resolve({base64:reader.result.split(',')[1]});reader.readAsDataURL(file);})));const result=await api('upload',{files:encoded});checkpoint();w.content.splice(insertAt,0,...result.files.map(src=>({type:'image',src,alt:'',caption:'',width:'full',align:'center'})));changed();});
  $('#remove').onclick=()=>{if(confirm(`「${w.title||'新しい作品'}」を削除しますか？`)){checkpoint();data.works.splice(selected,1);selected=Math.max(0,selected-1);changed();}};
}
$('#add').onclick=()=>{const day=new Date().toLocaleDateString('sv-SE').replaceAll('-','');let date;try{date=nextWorkDate(day,data.works.map(w=>w.date));}catch(e){status(e.message,true);return;}checkpoint();data.works.unshift({id:date,date,title:'',venue:'',subtitle:'',tags:[],info:[],content:[],description:'',images:[]});selected=0;markDirty();render();$('#f-title').focus();};
$('#draft').onclick=()=>run(async()=>{await api('draft',{data});dirty=false;status(`下書きを保存しました（${new Date().toLocaleTimeString('ja-JP')}）。サイト用ファイルは変更していません。`);});
$('#preview').onclick=()=>run(async()=>{status('プレビューを作成しています…');await api('preview',{data});$('#preview-panel').hidden=false;$('#preview-frame').src=data.works[selected]?`/works/${encodeURIComponent(data.works[selected].id)}/?preview=${Date.now()}`:'/works/';status('プレビューを更新しました。現在編集中の内容を表示しています。');});
$('#close-preview').onclick=()=>{$('#preview-panel').hidden=true;};
async function apply(confirmDelete=false) { await run(async()=>{status('画像とデータを確認して反映しています…');const result=await api('apply',{data,base,confirmDelete});data=normalizeData(result.data);base=structuredClone(result.data);dirty=false;render();status('このMacのサイト用ファイルに反映しました。_siteにGitHub Pages用ファイルも生成しました。公開サイトへの送信はまだ行っていません。');}); }
$('#apply').onclick=()=>{const deleted=base.works.filter(w=>!data.works.some(n=>n.id===w.id));if(deleted.length){$('#confirm-text').textContent=`次の作品がサイト用データから削除されます。\n\n${deleted.map(w=>w.title).join('\n')}\n\n変更前のデータはMac内にバックアップします。`;$('#confirm-dialog').showModal();}else apply();};
$('#cancel-delete').onclick=()=>$('#confirm-dialog').close();$('#confirm-delete').onclick=()=>{$('#confirm-dialog').close();apply(true);};
let connected=false;
async function checkConnection(){
  const result=await api('auth/status',{});connected=result.connected;
  $('#github-connect').textContent=connected?'GitHub接続済み':'GitHubに接続';
  $('#connection-status').textContent=connected?`${result.login} と接続しています。トークン入力なしで送信できます。`:result.unavailable?'GitHubに接続できませんでした。ネットワークを確認して再度お試しください。':'まだ接続されていません。「接続を始める」から認証してください。';
  return connected;
}
$('#github-connect').onclick=()=>run(async()=>{$('#connect-dialog').showModal();await checkConnection();});
$('#close-connect').onclick=()=>$('#connect-dialog').close();
$('#check-connect').onclick=()=>run(checkConnection);
$('#start-connect').onclick=()=>run(async()=>{await api('auth/connect',{});$('#connection-status').textContent='ターミナルとブラウザで認証を完了してから「接続を確認」を押してください。';});
$('#publish').onclick=()=>run(async()=>{if(dirty || JSON.stringify(normalizeData(data))!==JSON.stringify(normalizeData(base))){status('先に変更をサイト用ファイルに反映してください。',true);return;}if(!await checkConnection()){$('#connect-dialog').showModal();return;}$('#publish-dialog').showModal();});
$('#cancel-publish').onclick=()=>$('#publish-dialog').close();
$('#confirm-publish').onclick=()=>{$('#publish-dialog').close();run(async()=>{status('GitHubの最新状態を確認して送信しています…');const result=await api('publish',{data});status(result.unchanged?'GitHubと同じ内容です。送信する変更はありません。':`GitHubに保存しました（${result.sha.slice(0,7)}）。公開処理の完了はGitHub Actionsで確認してください。`);});};
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
try{const result=await fetch('/api/data').then(r=>r.json());base=result.source;data=normalizeData(result.draft || result.source);data.works.forEach(w=>{w.id=w.date;delete w.number;delete w.url;});data.works.sort((a,b)=>compareWorkDates(a.date,b.date));render();status(result.draft?'保存済みの下書きを読み込みました。公開サイトへの送信は行っていません。':'GitHubから取得した作品データを読み込みました。作品を選んで編集できます。');}catch(e){status('データを読み込めませんでした。管理アプリを再起動してください。',true);}

checkConnection().catch(()=>{});

$('#work-search').oninput=e=>{search=e.target.value.toLocaleLowerCase();renderList();};
$('#close-tags').onclick=()=>$('#tags-dialog').close();
$('#close-media').onclick=()=>$('#media-dialog').close();
