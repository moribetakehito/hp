// One editable content stream; legacy fields are derived for older public renderers.
export const cleanTag = value => String(value ?? '').normalize('NFC').trim().replace(/^#+/, '').replace(/\s+/g, ' ');
export function uniqueTags(values) {
  if (!Array.isArray(values)) throw new Error('タグはリストで指定してください。');
  const found = new Set();
  return values.map(value => {
    if (typeof value !== 'string') throw new Error('タグは文字列で入力してください。');
    return cleanTag(value);
  }).filter(value => {
    const key=value.toLocaleLowerCase();
    if (!value || found.has(key)) return false;
    if (value.length>60) throw new Error('タグは60文字以内で入力してください。');
    found.add(key); return true;
  });
}
export function normalizeData(input) {
  if (!input || !Array.isArray(input.works)) throw new Error('作品データの形式が正しくありません。');
  const tags = uniqueTags(input.tags || []);
  const works = input.works.map(raw => {
    if (!raw || typeof raw!=='object') throw new Error('作品の形式が正しくありません。');
    const work = {...raw};
    for (const key of ['date','title','subtitle','venue']) {
      if (work[key]!=null && typeof work[key]!=='string') throw new Error(`${key}は文字列で入力してください。`);
      work[key]=work[key] || '';
    }
    work.id=work.date;
    delete work.number; delete work.url;
    work.tags=uniqueTags(work.tags || []);
    for (const tag of work.tags) if(!tags.some(t=>t.toLocaleLowerCase()===tag.toLocaleLowerCase()))tags.push(tag);
    work.tags=work.tags.map(tag=>tags.find(t=>t.toLocaleLowerCase()===tag.toLocaleLowerCase()));
    if (work.info!=null && !Array.isArray(work.info)) throw new Error('諸情報は項目名と値のリストで入力してください。');
    work.info=(work.info || []).map(row=>{
      if (!row || typeof row.label!=='string' || typeof row.value!=='string') throw new Error('諸情報の項目名と値は文字列で入力してください。');
      return {label:row.label,value:row.value};
    });
    if (work.content==null) {
      if (work.description!=null && typeof work.description!=='string')throw new Error('本文は文字列で入力してください。');
      if (work.images!=null && !Array.isArray(work.images))throw new Error('画像はリストで指定してください。');
      work.content=[];
      if(work.description)work.content.push({type:'text',text:work.description,style:'body'});
      for(const src of work.images || [])work.content.push({type:'image',src,alt:'',caption:'',width:'full',align:'center'});
    }
    if (!Array.isArray(work.content))throw new Error('本文ブロックの形式が正しくありません。');
    work.content=work.content.map(block=>{
      if (block?.type==='text') {
        if(typeof block.text!=='string')throw new Error('テキストブロックは文字列で入力してください。');
        return {type:'text',text:block.text,style:block.style==='heading'?'heading':'body'};
      }
      if(block?.type==='image') {
        for (const key of ['src','alt','caption']) if(block[key]!=null && typeof block[key]!=='string')throw new Error('画像の情報は文字列で入力してください。');
        return {type:'image',src:block.src || '',alt:block.alt || '',caption:block.caption || '',width:['full','medium','small'].includes(block.width)?block.width:'full',align:['left','center','right'].includes(block.align)?block.align:'center'};
      }
      throw new Error('対応していない本文ブロックがあります。');
    });
    work.description=work.content.filter(b=>b.type==='text').map(b=>b.text).filter(Boolean).join('\n\n');
    work.images=work.content.filter(b=>b.type==='image').map(b=>b.src);
    return work;
  });
  return {version:2,tags,works};
}
export function renameTag(data, previous, replacement) {
  replacement=cleanTag(replacement);
  if(!replacement)throw new Error('タグ名を入力してください。');
  if(replacement.length>60)throw new Error('タグは60文字以内で入力してください。');
  data.tags=uniqueTags(data.tags.map(t=>t===previous?replacement:t));
  for(const work of data.works)work.tags=uniqueTags(work.tags.map(t=>t===previous?replacement:t));
  return normalizeData(data);
}
export function removeTag(data, tag) {
  data.tags=data.tags.filter(t=>t!==tag);
  for(const work of data.works)work.tags=work.tags.filter(t=>t!==tag);
  return normalizeData(data);
}
