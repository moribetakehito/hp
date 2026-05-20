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

  list.innerHTML = '';
  data.works.forEach((work) => {
    const link = document.createElement('a');
    link.href = workUrl(work);
    link.textContent = `${work.number} ${work.date} ${work.title}`;
    list.appendChild(link);
  });
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

  document.title = `${work.date || work.title} - moribe takehito`;

  const meta = page.querySelector('[data-work-meta]');
  if (meta) {
    meta.innerHTML = '';
    appendTextLines(meta, [work.number, work.date, work.venue, work.subtitle]);
    if (work.description) {
      if (meta.childNodes.length > 0) meta.appendChild(document.createElement('br'));
      appendDescription(meta, work.description);
    }
  }

  const stack = page.querySelector('[data-work-images]');
  if (stack) {
    stack.innerHTML = '';
    work.images.forEach((src) => {
      const img = document.createElement('img');
      img.src = imageUrl(src, work);
      img.alt = work.title;
      img.loading = 'lazy';
      stack.appendChild(img);
    });
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
