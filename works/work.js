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

function renderWorksList(data) {
  const list = document.querySelector('[data-works-list]');
  if (!list) return;

  list.innerHTML = '';
  data.works.forEach((work) => {
    const link = document.createElement('a');
    link.href = work.url;
    link.textContent = `${work.number} ${work.date} ${work.title}`;
    list.appendChild(link);
  });
}

function renderWorkDetail(data) {
  const page = document.querySelector('[data-work-id]');
  if (!page) return;

  const work = data.works.find((item) => item.id === page.dataset.workId);
  if (!work) return;

  document.title = `${work.date} - moribe takehito`;

  const meta = page.querySelector('[data-work-meta]');
  if (meta) {
    meta.innerHTML = '';
    appendTextLines(meta, [work.number, work.date, work.venue, work.subtitle, work.description]);
  }

  const stack = page.querySelector('[data-work-images]');
  if (stack) {
    stack.innerHTML = '';
    work.images.forEach((src) => {
      const img = document.createElement('img');
      img.src = src;
      img.alt = `${work.title}`;
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
