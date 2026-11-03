async function loadWorksData() {
  const response = await fetch('/works/data.json');
  if (!response.ok) throw new Error('works data could not be loaded');
  return response.json();
}

function appendTextLines(element, lines) {
  lines.filter(Boolean).forEach((line, index) => {
    if (index > 0) element.appendChild(document.createElement('br'));
    element.appendChild(document.createTextNode(line));
  });
}

function appendDescription(element, text) {
  if (!text) return;

  const lines = text.split(/\r?\n/);
  lines.forEach((line, lineIndex) => {
    if (lineIndex > 0) element.appendChild(document.createElement('br'));

    const linkPattern = /\[([^\]]+)\]\((https?:\/\/[^)\s]+|mailto:[^)\s]+|\/[^)\s]+)\)/g;
    let cursor = 0;
    let match;

    while ((match = linkPattern.exec(line)) !== null) {
      if (match.index > cursor) {
        element.appendChild(document.createTextNode(line.slice(cursor, match.index)));
      }

      const anchor = document.createElement('a');
      anchor.href = match[2];
      anchor.textContent = match[1];
      if (/^https?:\/\//.test(match[2])) {
        anchor.target = '_blank';
        anchor.rel = 'noopener';
      }
      element.appendChild(anchor);
      cursor = match.index + match[0].length;
    }

    if (cursor < line.length) {
      element.appendChild(document.createTextNode(line.slice(cursor)));
    }
  });
}

function workUrl(work) {
  return work.url || `/works/${encodeURIComponent(work.id)}/`;
}

function workIdFromPath() {
  const match = window.location.pathname.match(/^\/works\/([^/]+)\/?$/);
  if (!match || match[1] === 'work') return '';
  return decodeURIComponent(match[1]);
}

function imageUrl(src, work) {
  if (!src) return '';
  if (/^(https?:)?\/\//.test(src) || src.startsWith('/')) return src;
  const base = work.assetBase || `/works/${work.id}/`;
  return `${base.replace(/\/$/, '')}/${src.replace(/^\//, '')}`;
}

function renderWorksList(data) {
  const list = document.querySelector('[data-works-list]');
  if (!list) return;

  const tags=[...new Set(data.works.flatMap(w=>w.tags||[]))];
  let active=new URLSearchParams(location.search).get('tag')||'';
  const filters=document.createElement('div');filters.className='work-tags work-filters';
  function draw(){
    list.replaceChildren();filters.replaceChildren();
    if(tags.length)for(const tag of ['',...tags]){const button=document.createElement('button');button.textContent=tag||'すべて';button.className=tag===active?'selected':'';button.onclick=()=>{active=tag;const url=new URL(location.href);tag?url.searchParams.set('tag',tag):url.searchParams.delete('tag');history.replaceState(null,'',url);draw();};filters.append(button);}
    for(const work of data.works.filter(w=>!active||(w.tags||[]).includes(active))){const link=document.createElement('a');link.href=workUrl(work);link.textContent=`${work.date} ${work.title}`;list.append(link);}
    if(!list.childNodes.length){const message=document.createElement('p');message.textContent='該当する作品はありません。';list.append(message);}
  }
  list.before(filters);draw();
}

function selectedWorkId(page) {
  return page.dataset.workId || new URLSearchParams(window.location.search).get('id') || workIdFromPath();
}

function renderWorkDetail(data) {
  const page = document.querySelector('[data-work-detail]');
  if (!page) return;

  const id = selectedWorkId(page);
  const work = data.works.find((item) => item.id === id);
  if (!work) {
    page.classList.add('is-missing');
    return;
  }

  // WORK_CONTENT_V2 — ordered text / image blocks with optional metadata.
  document.title = `${work.title} - moribe takehito`;
  const meta=page.querySelector('[data-work-meta]');
  if(meta){meta.replaceChildren();appendTextLines(meta,[work.date,work.title,work.subtitle,work.venue]);}
  const stack=page.querySelector('[data-work-images]');
  if(stack){
    stack.replaceChildren();stack.classList.add('work-content');
    if(work.tags?.length){const tags=document.createElement('div');tags.className='work-tags';for(const tag of work.tags){const link=document.createElement('a');link.href=`/works/?tag=${encodeURIComponent(tag)}`;link.textContent=tag;tags.append(link);}stack.append(tags);}
    if(work.info?.length){const info=document.createElement('dl');info.className='work-info';for(const row of work.info){if(!row.label||!row.value)continue;const label=document.createElement('dt'),value=document.createElement('dd');label.textContent=row.label;value.textContent=row.value;info.append(label,value);}stack.append(info);}
    const content=work.content||[...(work.description?[{type:'text',text:work.description}]:[]),...(work.images||[]).map(src=>({type:'image',src}))];
    for(const block of content){
      if(block.type==='text'){if(!block.text)continue;const text=document.createElement(block.style==='heading'?'h2':'p');text.className='work-text';appendDescription(text,block.text);stack.append(text);}
      else if(block.type==='image'){const figure=document.createElement('figure');figure.className=`work-figure width-${['full','medium','small'].includes(block.width)?block.width:'full'} align-${['left','center','right'].includes(block.align)?block.align:'center'}`;const img=document.createElement('img');img.src=imageUrl(block.src,work);img.alt=block.alt||work.title;img.loading='lazy';figure.append(img);if(block.caption){const caption=document.createElement('figcaption');caption.textContent=block.caption;figure.append(caption);}stack.append(figure);}
    }
  }
}

loadWorksData()
  .then((data) => {
    renderWorksList(data);
    renderWorkDetail(data);
  })
  .catch(() => {
    document.documentElement.classList.add('works-data-error');
  });
