// 헤더 오른쪽 검색창: 제목만 검색
//   기본       → article.json (문서, /w/)
//   '분류:' …  → category.json (분류, /c/)
//   '틀:' …    → templete.json (틀, /t/)
//   '파일:' …  → file.json (파일, /f/)
// layout.js가 머리글을 만든 뒤 initSearch(header)로 검색창을 붙임

const collator = new Intl.Collator('ko');

// 검색 대상 종류: 접두어, 인덱스 주소, 페이지 주소
const KINDS = {
  article:  { prefix: '',      index: '/indexes/article.json',  dir: '/w/' },
  category: { prefix: '분류:', index: '/indexes/category.json', dir: '/c/' },
  template: { prefix: '틀:',   index: '/indexes/templete.json', dir: '/t/' },
  file:     { prefix: '파일:', index: '/indexes/file.json',     dir: '/f/' },
};

// HTML 특수문자 이스케이프 (article.js를 다시 import하지 않으려고 따로 둠)
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// 'a/b/c/' 같은 키에서 마지막 조각(슬러그)
const slugOf = key => key.split('/').filter(Boolean).pop();

// 인덱스는 처음 필요할 때 한 번만 불러옴 → [{ slug, title, url, key }]
const cache = new Map();
function loadIndex(kind) {
  if (!cache.has(kind)) {
    const { index, dir } = KINDS[kind];
    const p = fetch(index)
      .then(r => { if (!r.ok) throw new Error(`${index} 응답 ${r.status}`); return r.json(); })
      .then(data => Object.entries(data).map(([key, info]) => {
        const slug = slugOf(key);
        const title = String(info?.title ?? slug);
        return { slug, title, key: title.toLowerCase(), url: `${dir}${encodeURIComponent(slug)}/` };
      }))
      .catch(err => { cache.delete(kind); throw err; });
    cache.set(kind, p);
  }
  return cache.get(kind);
}

// 입력값 → { kind, term }
function parseQuery(raw) {
  const q = raw.trim();
  for (const kind of ['category', 'template', 'file']) {
    const { prefix } = KINDS[kind];
    if (q.startsWith(prefix)) return { kind, term: q.slice(prefix.length).trim() };
  }
  return { kind: 'article', term: q };
}

// 제목 검색: 검색어가 제목 앞쪽에서 나올수록 위로, 위치가 같으면 가나다순 (개수 제한 없음)
function search(items, term) {
  const t = term.toLowerCase();
  return items
    .map(it => ({ it, pos: it.key.indexOf(t) }))
    .filter(r => r.pos >= 0)
    .sort((a, b) => a.pos - b.pos || collator.compare(a.it.title, b.it.title))
    .map(r => r.it);
}

// 제목에서 검색어 부분을 <mark>로 강조
function highlight(title, term) {
  if (!term) return escapeHtml(title);
  const i = title.toLowerCase().indexOf(term.toLowerCase());
  if (i < 0) return escapeHtml(title);
  return escapeHtml(title.slice(0, i))
    + `<mark>${escapeHtml(title.slice(i, i + term.length))}</mark>`
    + escapeHtml(title.slice(i + term.length));
}

export function initSearch(header) {
  if (!header || header.querySelector('.site-search')) return;

  const box = document.createElement('div');
  box.className = 'site-search';
  box.innerHTML = `
    <input type="search" class="site-search-input" placeholder="검색" aria-label="검색"
      autocomplete="off" spellcheck="false" role="combobox" aria-expanded="false"
      aria-controls="site-search-list" aria-autocomplete="list">
    <ul id="site-search-list" class="site-search-list" role="listbox" hidden></ul>`;
  header.append(box);

  const input = box.querySelector('input');
  const list = box.querySelector('ul');
  let results = [];
  let active = -1;
  let seq = 0;   // 늦게 도착한 이전 검색 결과를 버리기 위한 번호

  const close = () => {
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    active = -1;
  };

  const setActive = i => {
    const items = list.querySelectorAll('.site-search-item');
    items.forEach((el, k) => el.setAttribute('aria-selected', String(k === i)));
    active = i;
    if (i >= 0) {
      input.setAttribute('aria-activedescendant', items[i].id);
      items[i].scrollIntoView({ block: 'nearest' });
    } else {
      input.removeAttribute('aria-activedescendant');
    }
  };

  async function update() {
    const my = ++seq;
    const raw = input.value;
    if (!raw.trim()) { results = []; close(); return; }

    const { kind, term } = parseQuery(raw);
    let items;
    try {
      items = await loadIndex(kind);
    } catch (err) {
      console.error(err);
      if (my !== seq) return;
      results = [];
      list.hidden = true;
      return;
    }
    if (my !== seq) return;

    results = search(items, term);
    const label = KINDS[kind].prefix;
    list.innerHTML = results.length
      ? results.map((r, i) => `
        <li id="site-search-opt-${i}" class="site-search-item" role="option" aria-selected="false">
          <a href="${r.url}">${label ? `<span class="site-search-kind">${escapeHtml(label)}</span>` : ''}${highlight(r.title, term)}</a>
        </li>`).join('')
      : '';
    list.hidden = results.length ? false : true;
    input.setAttribute('aria-expanded', 'true');
    setActive(-1);   // 처음엔 아무것도 강조하지 않음 (Enter는 첫 결과로 이동)
  }

  input.addEventListener('input', update);
  input.addEventListener('focus', () => { if (input.value.trim()) update(); });

  input.addEventListener('keydown', e => {
    if (e.isComposing || e.keyCode === 229) return;   // 한글 조합 중에는 무시
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!results.length) return;
      e.preventDefault();
      if (list.hidden) { update(); return; }
      const d = e.key === 'ArrowDown' ? 1 : -1;
      const n = results.length;
      setActive(active < 0 ? (d > 0 ? 0 : n - 1) : (active + d + n) % n);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = results[active] ?? results[0];
      if (target) location.href = target.url;
    } else if (e.key === 'Escape') {
      if (!list.hidden) { e.preventDefault(); close(); }
      else input.blur();
    }
  });

  // 결과 위에 마우스를 올리면 선택 표시 이동 (터치에서는 하지 않음: iOS에서 첫 탭이 hover로 먹히는 걸 막음)
  list.addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse') return;
    const li = e.target.closest('.site-search-item');
    if (li) {
      const i = [...list.children].indexOf(li);
      if (i !== active) setActive(i);
    }
  });
  // 마우스가 목록 밖으로 나가면 강조 해제
  list.addEventListener('pointerleave', e => {
    if (e.pointerType === 'mouse') setActive(-1);
  });

  // 검색창 바깥을 누르면 닫음
  document.addEventListener('pointerdown', e => { if (!box.contains(e.target)) close(); });
  // Tab 등으로 포커스가 다른 요소로 넘어갈 때만 닫음.
  // relatedTarget이 없으면(iOS에서 링크를 탭하거나 키보드를 내린 경우) 닫지 않음:
  // 여기서 닫아 버리면 click이 오기 전에 목록이 사라져 링크로 이동하지 못함
  box.addEventListener('focusout', e => {
    if (e.relatedTarget && !box.contains(e.relatedTarget)) close();
  });

  // '/' 키로 검색창에 바로 포커스
  document.addEventListener('keydown', e => {
    if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
    e.preventDefault();
    input.focus();
  });
}

