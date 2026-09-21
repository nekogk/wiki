// 글 페이지(/w/이름/): /w/이름.md를 불러와서 #content에 렌더링한다.
// Obsidian 문법(수식, ![[임베드]], [[위키링크]], ==하이라이트==, %%주석%%, 콜아웃)을 처리한다.

import markdownit from 'https://cdn.jsdelivr.net/npm/markdown-it@14.1.0/+esm';
import katex from 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.mjs';

const KATEX_CSS = 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css';

// 자리표시자: 마크다운 파서가 절대 건드리지 않는 사용 영역(Private Use) 문자
const MATH_OPEN = '\uE000', MATH_CLOSE = '\uE001';
const CODE_OPEN = '\uE002', CODE_CLOSE = '\uE003';
const HTML_OPEN = '\uE004', HTML_CLOSE = '\uE005';

const md = markdownit({
  html: true,        // 내 글이니까 md 안의 HTML 허용
  linkify: true,
  typographer: false,
  breaks: true,      // Obsidian처럼 줄바꿈 한 번을 <br>로
});

// 페이지 제목(<h1>)은 index.json에서 오므로 md의 제목은 한 단계씩 내린다.
// # → h2, ## → h3, ... ##### → h6, ###### → h6
md.core.ruler.push('shift_headings', state => {
  for (const t of state.tokens) {
    if (t.type === 'heading_open' || t.type === 'heading_close') {
      t.tag = 'h' + Math.min(Number(t.tag.slice(1)) + 1, 6);
    }
  }
});

// ---------- 전처리 ----------

function stripFrontmatter(src) {
  return src.replace(/^\uFEFF?---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
}

// 코드 펜스(``` / ~~~) 바깥 부분에만 fn을 적용한다.
function mapOutsideFences(src, fn) {
  const lines = src.split('\n');
  const out = [];
  let buf = [];
  let fence = null;
  const flush = () => { if (buf.length) { out.push(fn(buf.join('\n'))); buf = []; } };

  for (const line of lines) {
    const m = line.match(/^\s*(`{3,}|~{3,})/);
    if (fence) {
      out.push(line);
      if (m && m[1][0] === fence[0] && m[1].length >= fence.length && /^\s*[`~]+\s*$/.test(line)) fence = null;
    } else if (m) {
      flush();
      fence = m[1];
      out.push(line);
    } else {
      buf.push(line);
    }
  }
  flush();
  return out.join('\n');
}

function encodePath(p) {
  return p.split('/').map(encodeURIComponent).join('/');
}

function headingId(text) {
  return text.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^\p{L}\p{N}_-]/gu, '');
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i;

const WIKI_DIR = '/w/';
let knownDocs = null;   // /w/index.json에 있는 문서 이름들. 없는 문서 링크를 회색으로 표시하는 데 쓴다

// [[rushichi#제목|표시]] 의 대상 → /w/rushichi/#제목
function resolveWikiTarget(target) {
  const [pathPart, heading] = target.split('#');
  const hash = heading ? '#' + headingId(heading) : '';
  if (!pathPart.trim()) return hash;                       // [[#제목]] : 같은 문서 안
  const slug = pathPart.trim().replace(/\.md$/, '').split('/').pop();
  if (knownDocs && !knownDocs.has(slug)) return null;      // 아직 없는 문서
  return `${WIKI_DIR}${encodeURIComponent(slug)}/${hash}`;
}

// 이미지 크기: px 수 ÷ 36 = rem.  |36 → 높이 1rem,  |72 → 높이 2rem,  |360x72 → 너비 10rem·높이 2rem
function sizeStyle(opt) {
  const m = (opt ?? '').trim().match(/^(\d+)(?:x(\d+))?$/);
  if (!m) return null;
  const rem = n => `${Number((Number(n) / 36).toFixed(4))}rem`;
  return m[2] ? `width: ${rem(m[1])}; height: ${rem(m[2])};` : `height: ${rem(m[1])}; width: auto;`;
}

// ---------- 지도 ----------
// ![[map:위도,경도]]  ![[map:위도,경도,줌]]  ![[map:위도,경도,줌|높이]]  ![[map:위도,경도,줌|너비x높이]]
// 좌표는 지도에서 Shift+클릭하면 복사되는 [위도, 경도] 값, 줌은 -5 ~ 3 (기본 0).
// 크기는 이미지처럼 px ÷ 36 = rem. 크기를 안 쓰면 본문 폭에 16:10 비율
const MAP_URL = 'https://sluqecu.dacordia.com/';
const MAP_EMBED = /!\[\[map:\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*(?:,\s*(-?[\d.]+)\s*)?(?:\\?\|\s*([^\]]*?)\s*)?\]\]/g;

function mapStyle(opt) {
  const m = (opt ?? '').match(/^(\d+)(?:x(\d+))?$/);
  if (!m) return '';
  const rem = n => `${Number((Number(n) / 36).toFixed(4))}rem`;
  return m[2] ? ` style="width: ${rem(m[1])}; height: ${rem(m[2])};"` : ` style="height: ${rem(m[1])};"`;
}

function mapIframe(lat, lng, zoom, opt) {
  const z = zoom ?? '0';
  const src = `${MAP_URL}?at=${lat},${lng}&z=${z}&embed=1`;
  return `<iframe class="map-embed" src="${src}"${mapStyle(opt)} loading="lazy" title="슬루케추 지도 (${lat}, ${lng})"></iframe>`;
}

// 이미지를 찾아볼 주소 목록 (앞에서부터 시도)
//   파일 이름만: 이 문서의 폴더(/w/daco/) → /w/assets/
//   경로를 씀:   /w/ 기준 (예: daco/profile.png → /w/daco/profile.png)
//   http:, data:, /절대경로: 그대로
function assetCandidates(src, base) {
  if (/^([a-z][a-z0-9+.-]*:|\/|#)/i.test(src)) return [src];
  const clean = decodeURIComponent(src);
  if (clean.includes('/')) return [WIKI_DIR + encodePath(clean)];
  const list = [];
  if (base && base !== WIKI_DIR) list.push(base + encodePath(clean));
  list.push(`${WIKI_DIR}assets/${encodePath(clean)}`);
  return list;
}

function imgSrcAttrs(src, base) {
  const [first, ...rest] = assetCandidates(src, base);
  return `src="${first}"` + (rest.length ? ` data-fallback="${rest.join(' ')}"` : '');
}

// 첫 주소에서 못 불러오면 data-fallback의 다음 주소로 바꿔 다시 시도
function attachFallback(img) {
  img.addEventListener('error', () => {
    const list = (img.dataset.fallback ?? '').split(' ').filter(Boolean);
    if (!list.length) return;
    img.dataset.fallback = list.slice(1).join(' ');
    img.src = list[0];
  });
}

function transformText(text, base, maths, htmls) {
  const codes = [];
  // 만들어 낸 HTML은 자리표시자로 넣어서 마크다운 문단 처리를 방해하지 않게 한다
  const keep = h => { htmls.push(h); return HTML_OPEN + (htmls.length - 1) + HTML_CLOSE; };

  // %%주석%% 제거
  text = text.replace(/%%[\s\S]*?%%/g, '');

  // 인라인 코드 보호
  text = text.replace(/(`+)([\s\S]*?[^`])\1(?!`)/g, m => {
    codes.push(m);
    return CODE_OPEN + (codes.length - 1) + CODE_CLOSE;
  });

  // 블록 수식 $$...$$
  text = text.replace(/\$\$([\s\S]+?)\$\$/g, (_, tex) => {
    // 콜아웃/인용 안의 수식이면 각 줄 앞의 "> "를 걷어낸다
    tex = tex.replace(/^[ \t]*>[ \t]?/gm, '');
    maths.push({ tex, display: true });
    return MATH_OPEN + (maths.length - 1) + MATH_CLOSE;
  });

  // 인라인 수식 $...$ (Obsidian 규칙: $ 바로 안쪽에 공백 없음)
  text = text.replace(/(^|[^\\$])\$(?=\S)((?:\\.|[^$\\\n])+?)(?<=\S)\$(?!\d)/g, (_, pre, tex) => {
    maths.push({ tex, display: false });
    return pre + MATH_OPEN + (maths.length - 1) + MATH_CLOSE;
  });

  // 지도 ![[map:위도,경도,줌|크기]]  (일반 임베드보다 먼저)
  text = text.replace(MAP_EMBED, (_, lat, lng, zoom, opt) => keep(mapIframe(lat, lng, zoom, opt)));

  // 임베드 ![[파일|크기]]
  // (옵시디언은 표 안에서 |를 \|로 저장하므로 둘 다 받는다)
  text = text.replace(/!\[\[([^\]]+)\]\]/g, (_, inner) => {
    const [target, opt] = inner.split(/\\?\|/);
    const name = target.trim();
    if (IMAGE_EXT.test(name)) {
      const style = sizeStyle(opt);
      const alt = opt && !style ? opt.trim() : '';
      return keep(`<img ${imgSrcAttrs(name, base)} alt="${escapeHtml(alt)}"${style ? ` style="${style}"` : ''} loading="lazy">`);
    }
    // 이미지가 아닌 임베드(다른 노트 등)는 링크로
    const href = resolveWikiTarget(name);
    const label = escapeHtml(opt ? opt.trim() : name);
    return keep(href !== null ? `<a href="${href}">${label}</a>` : label);
  });

  // 위키링크 [[대상|표시]]
  text = text.replace(/\[\[([^\]]+)\]\]/g, (_, inner) => {
    const [target, alias] = inner.split(/\\?\|/);
    const label = escapeHtml((alias ?? target.split('#').pop().split('/').pop()).trim());
    const href = resolveWikiTarget(target.trim());
    return keep(href !== null ? `<a href="${href}">${label}</a>` : `<span class="wikilink-unresolved">${label}</span>`);
  });

  // ==하이라이트==
  text = text.replace(/==([^=\n]+)==/g, (_, inner) => keep('<mark>') + inner + keep('</mark>'));

  // 인라인 코드 복원
  text = text.replace(new RegExp(CODE_OPEN + '(\\d+)' + CODE_CLOSE, 'g'), (_, i) => codes[+i]);
  return text;
}

// ---------- 후처리 ----------

function restorePlaceholders(html, maths, htmls) {
  html = html.replace(new RegExp(`${HTML_OPEN}(\\d+)${HTML_CLOSE}`, 'g'), (_, i) => htmls[+i]);
  const render = (i, forceDisplay) => {
    const { tex, display } = maths[+i];
    const out = katex.renderToString(tex.trim(), { displayMode: display || forceDisplay, throwOnError: false });
    return display ? `<span class="math-display">${out}</span>` : out;
  };
  // 블록 수식은 그 자체로 한 줄을 차지하므로, 바로 앞뒤의 <br>은 빈 줄만 만든다 → 제거
  html = html.replace(new RegExp(`(?:<br>\\s*)?(${MATH_OPEN}(\\d+)${MATH_CLOSE})(?:\\s*<br>)?`, 'g'),
    (whole, ph, i) => (maths[+i].display ? ph : whole));
  // 한 문단 전체가 블록 수식이면 <p>를 벗겨낸다
  html = html.replace(new RegExp(`<p>${MATH_OPEN}(\\d+)${MATH_CLOSE}</p>`, 'g'), (_, i) => render(i));
  return html.replace(new RegExp(`${MATH_OPEN}(\\d+)${MATH_CLOSE}`, 'g'), (_, i) => render(i));
}

// > [!note] 제목  /  > [!tip]- 접힌 콜아웃
function buildCallouts(root) {
  for (const bq of root.querySelectorAll('blockquote')) {
    const first = bq.firstElementChild;
    if (!first || first.tagName !== 'P') continue;
    const m = first.innerHTML.match(/^\s*\[!([\w-]+)\]([+-]?)[ \t]*([^\n<]*?)\s*(?:<br>\s*|$)/);
    if (!m) continue;

    const [whole, type, fold, rawTitle] = m;
    const title = rawTitle || type.charAt(0).toUpperCase() + type.slice(1);
    first.innerHTML = first.innerHTML.slice(whole.length);
    if (!first.innerHTML.trim()) first.remove();

    const box = document.createElement(fold ? 'details' : 'div');
    box.className = `callout callout-${type.toLowerCase()}`;
    if (fold === '+') box.open = true;

    const head = document.createElement(fold ? 'summary' : 'div');
    head.className = 'callout-title';
    head.innerHTML = title;

    const body = document.createElement('div');
    body.className = 'callout-body';
    body.append(...bq.childNodes);

    box.append(head);
    if (body.textContent.trim() || body.querySelector('img,.katex')) box.append(body);
    bq.replaceWith(box);
  }
}

// 표 칸 병합: 칸 내용이 "<" 뿐이면 왼쪽 칸과, "^" 뿐이면 위쪽 칸과 합친다.
// (`<`처럼 코드로 쓰거나 다른 글자가 섞이면 병합하지 않고 그대로 보인다)
function isMarker(cell, mark) {
  return cell.children.length === 0 && cell.textContent.trim() === mark;
}

function mergeTableCells(root) {
  for (const table of root.querySelectorAll('table')) {
    const rows = [...table.rows];

    // 1) "<" : 가장 가까운 왼쪽 칸의 colspan을 늘리고 이 칸은 지운다 ("<" 여러 개면 계속 늘어남)
    for (const row of rows) {
      let left = null;
      for (const cell of [...row.cells]) {
        if (left && isMarker(cell, '<')) { left.colSpan += 1; cell.remove(); }
        else left = cell;
      }
    }

    // 2) "^" : 같은 열에서 바로 위 칸(이미 병합된 칸이면 그 칸)의 rowspan을 늘린다
    //    마크다운 표는 모든 줄에 칸이 다 있으므로 열 번호는 칸 순서와 colspan으로 계산
    const owner = [];   // owner[행][열] = 그 자리를 차지하는 칸
    rows.forEach((row, r) => {
      owner[r] = [];
      let col = 0;
      for (const cell of [...row.cells]) {
        const span = cell.colSpan;
        const up = r > 0 ? owner[r - 1][col] : null;
        if (up && isMarker(cell, '^') && up.parentElement.parentElement === row.parentElement) {
          up.rowSpan += 1;
          for (let k = 0; k < span; k++) owner[r][col + k] = up;
          cell.remove();
        } else {
          for (let k = 0; k < span; k++) owner[r][col + k] = cell;
        }
        col += span;
      }
    });
  }
}

function addHeadingIds(root) {
  const used = new Map();
  for (const h of root.querySelectorAll('h1, h2, h3, h4, h5, h6')) {
    let id = headingId(h.textContent) || 'section';
    const n = used.get(id) || 0;
    used.set(id, n + 1);
    if (n) id += '-' + n;
    h.id = id;
  }
}

// category(없음, 문자열, 배열) → "분류: 뭐시기, 저시기" (분류가 없으면 줄 자체를 생략)
// /c/index.json({ "폴더": "카테고리 이름" })에 있는 카테고리는 /c/폴더/ 링크가 된다
function categoryLine(value, catDirs) {
  const cats = (Array.isArray(value) ? value : [value]).filter(Boolean).map(String);
  if (!cats.length) return '';
  const folderOf = new Map(Object.entries(catDirs).map(([folder, name]) => [name, folder]));
  const items = cats.map(c => {
    const folder = folderOf.get(c);
    return folder ? `<a href="/c/${encodeURIComponent(folder)}/">${escapeHtml(c)}</a>` : escapeHtml(c);
  });
  return `<p class="article-meta">분류: ${items.join(', ')}</p>`;
}

// 보통 마크다운 문법으로 쓴 상대 경로도 위키 구조에 맞춘다
//   ![](그림.png) → /w/assets/그림.png,   [글](rushichi.md#제목) → /w/rushichi/#제목
// base: 이 문서의 주소(/w/daco/). 파일 이름만 쓴 이미지를 이 폴더에서 먼저 찾는다
export function fixRelativePaths(root, base = null) {
  for (const img of root.querySelectorAll('img[src]')) {
    if (!img.hasAttribute('data-fallback')) {
      const [first, ...rest] = assetCandidates(img.getAttribute('src'), base);
      img.setAttribute('src', first);
      if (rest.length) img.dataset.fallback = rest.join(' ');
    }
    if (img.dataset.fallback) attachFallback(img);
    // 옵시디언식 크기 지정 ![설명|36](그림.png)
    const m = (img.getAttribute('alt') ?? '').match(/^(.*?)\\?\|(\d+(?:x\d+)?)$/);
    if (m && !img.getAttribute('style')) {
      img.setAttribute('alt', m[1].trim());
      img.setAttribute('style', sizeStyle(m[2]));
    }
  }
  for (const a of root.querySelectorAll('a[href]')) {
    const m = a.getAttribute('href').match(/^(?![a-z][a-z0-9+.-]*:|\/|#)([^#]+)\.md(#.*)?$/i);
    if (m) a.setAttribute('href', `${WIKI_DIR}${encodeURIComponent(decodeURIComponent(m[1]).split('/').pop())}/${m[2] ?? ''}`);
  }
}

// ---------- 실행 ----------

export function renderMarkdown(src, base, docs = null) {
  knownDocs = docs;
  const maths = [], htmls = [];
  const pre = mapOutsideFences(stripFrontmatter(src), t => transformText(t, base, maths, htmls));
  return restorePlaceholders(md.render(pre), maths, htmls);
}

async function main() {
  const root = document.getElementById('content');
  if (!root) return;

  if (!document.querySelector(`link[href="${KATEX_CSS}"]`)) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = KATEX_CSS;
    document.head.append(link);
  }

  const base = location.pathname.replace(/\/?$/, '/');   // 항상 "/w/rushichi/" 형태
  const slug = decodeURIComponent(base.split('/').filter(Boolean).pop() ?? '');
  const getJson = url => fetch(url).then(r => (r.ok ? r.json() : {})).catch(() => ({}));

  try {
    const [mdRes, meta, catDirs] = await Promise.all([
      fetch(`${WIKI_DIR}${encodeURIComponent(slug)}.md`),
      getJson(`${WIKI_DIR}index.json`),
      getJson('/c/index.json'),
    ]);
    if (!mdRes.ok) throw new Error(`${slug}.md를 찾을 수 없습니다 (${mdRes.status})`);

    // 키는 "rushichi"든 "/w/rushichi/"든 마지막 조각만 본다
    const bySlug = new Map(Object.entries(meta).map(([k, v]) => [k.split('/').filter(Boolean).pop(), v]));
    const info = bySlug.get(slug);
    let header = '';
    if (info) {
      header = `<header class="article-header">
        <h1>${escapeHtml(info.title)}</h1>
        ${categoryLine(info.category, catDirs)}
      </header>`;
    }

    const docs = bySlug.size ? new Set(bySlug.keys()) : null;
    root.innerHTML = header + `<div class="article-body">${renderMarkdown(await mdRes.text(), base, docs)}</div>`;
    const bodyEl = root.querySelector('.article-body');
    fixRelativePaths(bodyEl, base);
    mergeTableCells(bodyEl);
    buildCallouts(bodyEl);
    addHeadingIds(bodyEl);

    // 표와 긴 수식이 화면 밖으로 넘치지 않게 감싼다
    for (const t of bodyEl.querySelectorAll('table')) {
      const wrap = document.createElement('div');
      wrap.className = 'table-wrap';
      t.replaceWith(wrap);
      wrap.append(t);
    }

    if (location.hash) document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView();
  } catch (err) {
    root.innerHTML = `<p class="load-error">글을 불러오지 못했습니다. ${escapeHtml(err.message)}</p>`;
    console.error(err);
  }
}

main();
