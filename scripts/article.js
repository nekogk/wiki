import markdownit from 'https://cdn.jsdelivr.net/npm/markdown-it@14.1.0/+esm';
import katex from 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.mjs';

// ── 경로·URL 상수 ──
export const WIKI_DIR = '/w/';
export const MD_DIR = '/articles/';
export const TEMPLATE_MD_DIR = '/articles/templates/';
export const ASSET_DIR = '/articles/files/';
export const ARTICLE_INDEX = '/indexes/article.json';
export const CATEGORY_INDEX = '/indexes/category.json';
export const TEMPLATE_DIR = '/t/';
export const TEMPLATE_INDEX = '/indexes/templete.json';
export const FILE_PAGE_DIR = '/f/';
export const FILE_INDEX = '/indexes/file.json';
const KATEX_CSS = 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css';
const MAP_URL = 'https://sluqecu.dacordia.com/';

// ── 치환용 자리표시자 (유니코드 사용자 영역 문자라 본문과 겹치지 않음) ──
const MATH_OPEN = '\uE000', MATH_CLOSE = '\uE001';
const CODE_OPEN = '\uE002', CODE_CLOSE = '\uE003';
const HTML_OPEN = '\uE004', HTML_CLOSE = '\uE005';
const BLOCK_OPEN = '\uE006', BLOCK_CLOSE = '\uE007';

// 자리표시자 검색용 정규식을 미리 만들어 둠 (g 플래그라 replace에서 재사용해도 안전)
const placeholderRe = (open, close, wrap = s => s) => new RegExp(wrap(`${open}(\\d+)${close}`), 'g');
const CODE_RE = placeholderRe(CODE_OPEN, CODE_CLOSE);
const HTML_RE = placeholderRe(HTML_OPEN, HTML_CLOSE);
const MATH_RE = placeholderRe(MATH_OPEN, MATH_CLOSE);
const MATH_P_RE = placeholderRe(MATH_OPEN, MATH_CLOSE, s => `<p>${s}</p>`);
const MATH_BR_RE = placeholderRe(MATH_OPEN, MATH_CLOSE, s => `(?:<br>\\s*)?(${s})(?:\\s*<br>)?`);
const BLOCK_RE = placeholderRe(BLOCK_OPEN, BLOCK_CLOSE);
const BLOCK_BR_RE = placeholderRe(BLOCK_OPEN, BLOCK_CLOSE, s => `(?:<br>\\s*)?(${s})(?:\\s*<br>)?`);
// <p> 안에 틀 자리표시자만 (하나 이상) 들어 있는 경우
const BLOCK_P_RE = new RegExp(`<p>((?:\\s*${BLOCK_OPEN}\\d+${BLOCK_CLOSE})+)\\s*</p>`, 'g');

// ── 문법 정규식 ──
const FRONTMATTER = /^\uFEFF?---\r?\n[\s\S]*?\r?\n---\r?\n?/;
const EMBED = /!\[\[([^\]]+)\]\]/g;
const FILE_EXT = /\.[a-z][a-z0-9]{0,4}$/i;   // 확장자가 있으면 에셋, 없으면 틀
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i;
const MAP_EMBED = /!\[\[map:\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*(?:,\s*(-?[\d.]+)\s*)?(?:\\?\|\s*([^\]]*?)\s*)?\]\]/g;

// 마크다운 파서 (HTML 허용, URL 자동 링크, 줄바꿈을 <br>로)
const md = markdownit({ html: true, linkify: true, breaks: true });

// 제목 단계를 한 칸씩 내림 (#→h2 …), 페이지의 h1은 문서 제목용으로 남겨 둠
md.core.ruler.push('shift_headings', state => {
  for (const t of state.tokens) {
    if (t.type === 'heading_open' || t.type === 'heading_close') {
      t.tag = 'h' + Math.min(Number(t.tag.slice(1)) + 1, 6);
    }
  }
});

// 헤더 행의 모든 칸이 비어 있으면 <thead>(와 <th>)를 아예 만들지 않음
md.core.ruler.push('drop_empty_table_head', state => {
  const t = state.tokens;
  for (let i = 0; i < t.length; i++) {
    if (t[i].type !== 'thead_open') continue;
    let end = i;
    while (t[end].type !== 'thead_close') end++;
    const empty = t.slice(i, end).every(x => x.type !== 'inline' || !x.content.trim());
    if (empty) t.splice(i, end - i + 1);
  }
});

// ── 공용 유틸 (common.js에서도 가져다 씀) ──

// HTML 특수문자 이스케이프
export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// 'a/b/c/' 같은 경로에서 마지막 조각(슬러그)을 꺼냄
export function slugOf(path) {
  return path.split('/').filter(Boolean).pop();
}

// 분류 값(문자열 하나 또는 배열)을 문자열 배열로 정규화
export function toCategories(value) {
  if (Array.isArray(value)) return value.filter(Boolean).map(String);
  return value ? [String(value)] : [];
}

// 문서 맨 앞의 YAML 머리말(--- … ---) 제거
export function stripFrontmatter(src) {
  return src.replace(FRONTMATTER, '');
}

// ![[…]] 안쪽 → 틀 이름. 확장자가 있거나(에셋) 지도면 null
function templateName(inner) {
  const name = inner.split(/\\?\|/)[0].trim();
  if (!name || FILE_EXT.test(name) || /^map:/i.test(name)) return null;
  return name;
}

// 원문에서 ![[틀]] 호출을 모두 제거 (미리보기용)
export function stripTemplates(src) {
  return src.replace(EMBED, (m, inner) => (templateName(inner) ? '' : m));
}

// KaTeX 스타일시트를 <head>에 한 번만 추가
export function ensureKatexCss() {
  if (document.querySelector(`link[href="${KATEX_CSS}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = KATEX_CSS;
  document.head.append(link);
}

// ── 마크다운 전처리 ──

// 코드 펜스(``` / ~~~) 바깥 부분에만 fn을 적용하고 펜스 안은 그대로 둠
function mapOutsideFences(src, fn) {
  const out = [];
  let buf = [];
  let fence = null;
  const flush = () => { if (buf.length) { out.push(fn(buf.join('\n'))); buf = []; } };

  for (const line of src.split('\n')) {
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

// 경로의 각 조각을 URL 인코딩 ('/'는 유지)
function encodePath(p) {
  return p.split('/').map(encodeURIComponent).join('/');
}

// 제목 텍스트 → 앵커 id
function headingId(text) {
  return text.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^\p{L}\p{N}_-]/gu, '');
}

// 위키 링크 대상('문서#제목', 'dir/문서.md')에서 문서 슬러그만 추출, 경로가 없으면 null
function wikiTargetSlug(target) {
  const pathPart = target.split('#')[0].trim();
  if (!pathPart) return null;
  return pathPart.replace(/\.md$/, '').split('/').pop();
}

// 위키 링크 대상 → href. 같은 문서 내 앵커면 '#…', 존재하지 않는 문서면 null
function resolveWikiTarget(target, docs) {
  const [pathPart, heading] = target.split('#');
  const hash = heading ? '#' + headingId(heading) : '';
  if (!pathPart.trim()) return hash;
  const slug = wikiTargetSlug(target);
  if (docs && !docs.has(slug)) return null;
  return `${WIKI_DIR}${encodeURIComponent(slug)}/${hash}`;
}

// 위키 링크 HTML: 현재 문서면 굵게, 대상 문서가 없으면 fallback
function wikiLink(target, label, ctx, fallback) {
  if (ctx.selfSlug && wikiTargetSlug(target) === ctx.selfSlug) return `<strong>${label}</strong>`;
  const href = resolveWikiTarget(target, ctx.docs);
  return href !== null ? `<a href="${href}">${label}</a>` : fallback;
}

// 크기 옵션 '64' / '400x160' → CSS 문자열 (px를 rem으로 환산), 형식이 아니면 null
function sizeStyle(opt) {
  const m = (opt ?? '').trim().match(/^(\d+)(?:x(\d+))?$/);
  if (!m) return null;
  const rem = n => `${Number((n / 16).toFixed(4))}rem`;
  return m[2]
    ? `width: ${rem(m[1])}; aspect-ratio: ${m[1]} / ${m[2]};`
    : `width: ${rem(m[1])}; height: auto;`;
}

// CSS 문자열 → ' style="…"' 속성 (없으면 빈 문자열)
const styleAttr = style => (style ? ` style="${style}"` : '');

// ![[map:위도,경도,줌|크기]] → 지도 iframe
function mapIframe(lat, lng, zoom = '0', opt) {
  const src = `${MAP_URL}?at=${lat},${lng}&z=${zoom}&embed=1`;
  return `<iframe class="map-embed" src="${src}"${styleAttr(sizeStyle(opt))} loading="lazy" title="Map (${lat}, ${lng})"></iframe>`;
}

// 에셋 이름 → URL. 절대 경로·외부 URL은 그대로, 나머지는 /articles/files/ 아래로
function assetUrl(src) {
  if (/^([a-z][a-z0-9+.-]*:|\/|#)/i.test(src)) return src;
  return `${ASSET_DIR}${encodePath(decodeURIComponent(src))}`;
}

// 위키 전용 문법(주석·틀·수식·지도·이미지·링크·형광펜)을 HTML/자리표시자로 바꿈
// 코드 구간은 잠시 빼 두었다가 마지막에 되돌려서 치환되지 않게 함
function transformText(text, ctx) {
  const { maths, htmls, blocks, templates } = ctx;
  const codes = [];
  const keep = h => { htmls.push(h); return HTML_OPEN + (htmls.length - 1) + HTML_CLOSE; };

  // %%주석%% 제거
  text = text.replace(/%%[\s\S]*?%%/g, '');

  // 인라인 코드 보호
  text = text.replace(/(`+)([\s\S]*?[^`])\1(?!`)/g, m => {
    codes.push(m);
    return CODE_OPEN + (codes.length - 1) + CODE_CLOSE;
  });

  // $$블록 수식$$ (인용문 안이면 '>' 접두어 제거)
  text = text.replace(/\$\$([\s\S]+?)\$\$/g, (_, tex) => {
    maths.push({ tex: tex.replace(/^[ \t]*>[ \t]?/gm, ''), display: true });
    return MATH_OPEN + (maths.length - 1) + MATH_CLOSE;
  });

  // $인라인 수식$
  text = text.replace(/(^|[^\\$])\$(?=\S)((?:\\.|[^$\\\n])+?)(?<=\S)\$(?!\d)/g, (_, pre, tex) => {
    maths.push({ tex, display: false });
    return pre + MATH_OPEN + (maths.length - 1) + MATH_CLOSE;
  });

  // 지도 임베드
  text = text.replace(MAP_EMBED, (_, lat, lng, zoom, opt) => keep(mapIframe(lat, lng, zoom, opt)));

  // ![[파일.확장자|크기 또는 alt]] → 에셋 (이미지는 <img>, 그 밖의 파일은 링크)
  // ![[틀]] → 틀 블록 자리표시자
  text = text.replace(EMBED, (_, inner) => {
    const [target, opt] = inner.split(/\\?\|/);
    const name = target.trim();
    if (IMAGE_EXT.test(name)) {
      const style = sizeStyle(opt);
      const alt = opt && !style ? opt.trim() : '';
      return keep(`<img src="${assetUrl(name)}" alt="${escapeHtml(alt)}"${styleAttr(style)} loading="lazy">`);
    }
    if (FILE_EXT.test(name)) {
      const label = escapeHtml(opt ? opt.trim() : name.split('/').pop());
      return keep(`<a href="${assetUrl(name)}">${label}</a>`);
    }
    const html = templates?.get(name);
    if (html) {
      blocks.push(html);
      return BLOCK_OPEN + (blocks.length - 1) + BLOCK_CLOSE;
    }
    return keep(`<span class="wikilink-unresolved">틀 없음: ${escapeHtml(name)}</span>`);
  });

  // [[문서#제목|라벨]]
  text = text.replace(/\[\[([^\]]+)\]\]/g, (_, inner) => {
    const [target, alias] = inner.split(/\\?\|/);
    const name = target.trim();
    const label = escapeHtml((alias ?? name.split('#').pop().split('/').pop()).trim());
    return keep(wikiLink(name, label, ctx, `<span class="wikilink-unresolved">${label}</span>`));
  });

  // ==형광펜==
  text = text.replace(/==([^=\n]+)==/g, (_, inner) => keep('<mark>') + inner + keep('</mark>'));

  // 인라인 코드 복원
  return text.replace(CODE_RE, (_, i) => codes[+i]);
}

// 마크다운 렌더 결과의 자리표시자를 실제 HTML·수식·틀로 되돌림
function restorePlaceholders(html, { maths, htmls, blocks }) {
  html = html.replace(HTML_RE, (_, i) => htmls[+i]);

  // 수식 하나를 KaTeX로 렌더
  const render = i => {
    const { tex, display } = maths[+i];
    const out = katex.renderToString(tex.trim(), { displayMode: display, throwOnError: false });
    return display ? `<span class="math-display">${out}</span>` : out;
  };
  // 블록 수식 앞뒤에 붙은 <br> 제거
  html = html.replace(MATH_BR_RE, (whole, ph, i) => (maths[+i].display ? ph : whole));
  html = html.replace(MATH_P_RE, (_, i) => render(i));
  html = html.replace(MATH_RE, (_, i) => render(i));

  // 틀 앞뒤에 붙은 <br> 제거 (틀이 연달아 오면 사이에 빈 줄이 생기던 문제)
  html = html.replace(BLOCK_BR_RE, '$1');
  // 틀만 든 <p>는 벗겨서 삽입
  html = html.replace(BLOCK_P_RE, (_, inner) => inner);
  return html.replace(BLOCK_RE, (_, i) => blocks[+i]);
}

// ── 렌더 후 DOM 후처리 ──

// > [!type]± 제목 형식의 인용문을 콜아웃 박스로 변환 (+/-가 있으면 접기 가능)
function buildCallouts(root) {
  for (const bq of root.querySelectorAll('blockquote')) {
    const first = bq.firstElementChild;
    if (!first || first.tagName !== 'P') continue;
    const m = first.innerHTML.match(/^\s*\[!([\w-]+)\]([+-]?)[ \t]*([^\n<]*?)\s*(?:<br>\s*|$)/);
    if (!m) continue;

    const [whole, type, fold, rawTitle] = m;
    first.innerHTML = first.innerHTML.slice(whole.length);
    if (!first.innerHTML.trim()) first.remove();

    const box = document.createElement(fold ? 'details' : 'div');
    box.className = `callout callout-${type.toLowerCase()}`;
    if (fold === '+') box.open = true;

    const head = document.createElement(fold ? 'summary' : 'div');
    head.className = 'callout-title';
    head.innerHTML = rawTitle || type.charAt(0).toUpperCase() + type.slice(1);

    const body = document.createElement('div');
    body.className = 'callout-body';
    body.append(...bq.childNodes);

    box.append(head);
    if (body.textContent.trim() || body.querySelector('img,.katex')) box.append(body);
    bq.replaceWith(box);
  }
}

// 셀 내용이 병합 기호('<' 또는 '^') 하나뿐인지 검사
function isMarker(cell, mark) {
  return cell.children.length === 0 && cell.textContent.trim() === mark;
}

// 표 셀 병합: '<'는 왼쪽 셀과 가로 병합, '^'는 위쪽 셀과 세로 병합
function mergeTableCells(root) {
  for (const table of root.querySelectorAll('table')) {
    const rows = [...table.rows];

    // 가로 병합
    for (const row of rows) {
      let left = null;
      for (const cell of [...row.cells]) {
        if (left && isMarker(cell, '<')) { left.colSpan += 1; cell.remove(); }
        else left = cell;
      }
    }

    // 세로 병합: owner[r][c] = 그 칸을 실제로 차지하는 셀 (같은 thead/tbody 안에서만 병합)
    const owner = [];
    rows.forEach((row, r) => {
      owner[r] = [];
      let col = 0;
      for (const cell of [...row.cells]) {
        const span = cell.colSpan;
        const up = r > 0 ? owner[r - 1][col] : null;
        let target = cell;
        if (up && isMarker(cell, '^') && up.parentElement.parentElement === row.parentElement) {
          up.rowSpan += 1;
          cell.remove();
          target = up;
        }
        for (let k = 0; k < span; k++) owner[r][col + k] = target;
        col += span;
      }
    });
  }
}

// 제목마다 고유 id 부여 (중복이면 -1, -2 …)
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

// 가로 스크롤을 위해 표를 .table-wrap으로 감쌈
function wrapTables(root) {
  for (const t of root.querySelectorAll('table')) {
    const wrap = document.createElement('div');
    wrap.className = 'table-wrap';
    t.replaceWith(wrap);
    wrap.append(t);
  }
}

// 표 밖의 이미지를 .img-scroll로 감쌈: 컨테이너보다 넓으면 표처럼 가로 스크롤
// (표 안의 이미지는 .table-wrap이 스크롤을 맡고, 정렬은 칸의 정렬을 따름)
function wrapImages(root) {
  for (const img of root.querySelectorAll('img')) {
    if (img.closest('table, .img-scroll, .file-view')) continue;
    const wrap = document.createElement('span');
    wrap.className = 'img-scroll';
    img.replaceWith(wrap);
    wrap.append(img);
  }
}

// 표준 마크다운 이미지의 'alt|크기' 처리, 상대 경로 .md 링크를 위키 주소로 변환
export function fixRelativePaths(root) {
  for (const img of root.querySelectorAll('img[src]')) {
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

// ── 렌더링 진입점 ──

// 마크다운 → HTML. docs: 존재하는 문서 슬러그 Set(null이면 링크 검사 안 함),
// templates: 틀 이름 → HTML Map, selfSlug: 굵게 표시할 현재 문서
export function renderMarkdown(src, docs = null, templates = null, selfSlug = null) {
  const ctx = { docs, templates, selfSlug, maths: [], htmls: [], blocks: [] };
  const pre = mapOutsideFences(stripFrontmatter(src), t => transformText(t, ctx));
  return restorePlaceholders(md.render(pre), ctx);
}

// 틀 문서 하나를 불러와 HTML로 렌더 (실패하면 null → '틀 없음' 표시)
async function loadTemplate(name, docs, selfSlug) {
  try {
    const res = await fetch(`${TEMPLATE_MD_DIR}${encodeURIComponent(name)}.md`);
    if (!res.ok) throw new Error(`${res.status}`);
    const html = renderMarkdown(await res.text(), docs, null, selfSlug);
    return `<div class="article-body wiki-template" data-template="${escapeHtml(name)}">${html}</div>`;
  } catch (err) {
    console.error(`틀을 불러오지 못했습니다: ${name}`, err);
    return null;
  }
}

// 본문(코드 펜스·인라인 코드 밖)에 쓰인 ![[틀]] 이름을 모아 모두 병렬로 불러옴
async function loadTemplateMap(src, docs, selfSlug) {
  const names = new Set();
  mapOutsideFences(stripFrontmatter(src), block => {
    const plain = block.replace(/%%[\s\S]*?%%/g, '').replace(/(`+)([\s\S]*?[^`])\1(?!`)/g, '');
    for (const m of plain.matchAll(EMBED)) {
      const name = templateName(m[1]);
      if (name) names.add(name);
    }
    return block;
  });
  const entries = await Promise.all([...names].map(async name => [name, await loadTemplate(name, docs, selfSlug)]));
  return new Map(entries);
}

// 문서 제목 아래에 붙는 '분류: …' 줄 (표시 이름 가나다순)
const collator = new Intl.Collator('ko');
function categoryLine(value, catDirs) {
  const slugs = toCategories(value);
  if (!slugs.length) return '';
  const items = slugs
    .map(slug => ({ slug, name: catDirs[slug]?.title }))
    .sort((a, b) => collator.compare(a.name ?? a.slug, b.name ?? b.slug))
    .map(({ slug, name }) => (name
      ? `<a href="/c/${encodeURIComponent(slug)}/">${escapeHtml(name)}</a>`
      : escapeHtml(slug)));
  return `<p class="article-meta">분류: ${items.join(', ')}</p>`;
}

// 파일 페이지(/f/슬러그/): 파일 인덱스에서 제목과 파일 이름을 찾아 파일을 그대로 보여 줌
async function renderFilePage(root, slug) {
  const res = await fetch(FILE_INDEX);
  if (!res.ok) throw new Error(`파일 목록을 불러오지 못했습니다 (${res.status})`);
  const info = (await res.json())[slug];
  if (!info) throw new Error(`${slug} 파일을 찾을 수 없습니다`);

  const name = String(info.file ?? slug);
  const title = `파일:${info.title ?? slug}`;
  const url = assetUrl(name);
  const view = IMAGE_EXT.test(name)
    ? `<a href="${url}"><img src="${url}" alt="${escapeHtml(title)}"></a>`
    : `<a href="${url}">${escapeHtml(name)}</a>`;

  root.innerHTML = `<header class="article-header">
        <h1>${escapeHtml(title)}</h1>
      </header>
      <div class="article-body file-view">${view}</div>`;
}

// 문서 페이지: 주소의 슬러그로 .md를 불러와 렌더
async function main() {
  const root = document.getElementById('content');
  // common.js가 렌더러를 쓰려고 이 모듈을 import할 때도 실행되므로 문서 페이지가 아니면 종료
  if (!root) return;

  ensureKatexCss();

  const slug = decodeURIComponent(slugOf(location.pathname) ?? '');
  // /t/ 아래는 틀 페이지: 제목은 틀 인덱스에서 가져오고 분류는 표시하지 않음
  const isTemplate = location.pathname.startsWith(TEMPLATE_DIR);
  // /f/ 아래는 파일 페이지: .md 없이 파일만 보여 줌
  if (location.pathname.startsWith(FILE_PAGE_DIR)) {
    try {
      await renderFilePage(root, slug);
    } catch (err) {
      root.innerHTML = `<p class="load-error">파일을 불러오지 못했습니다. ${escapeHtml(err.message)}</p>`;
      console.error(err);
    }
    return;
  }
  // 인덱스 JSON은 실패해도 빈 객체로 대체해서 본문은 보여 줌
  const getJson = url => fetch(url).then(r => (r.ok ? r.json() : {})).catch(() => ({}));

  try {
    const [mdRes, meta, catDirs, tplMeta] = await Promise.all([
      fetch(`${isTemplate ? TEMPLATE_MD_DIR : MD_DIR}${encodeURIComponent(slug)}.md`),
      getJson(ARTICLE_INDEX),
      getJson(CATEGORY_INDEX),
      isTemplate ? getJson(TEMPLATE_INDEX) : {},
    ]);
    if (!mdRes.ok) throw new Error(`${slug}.md를 찾을 수 없습니다 (${mdRes.status})`);

    const bySlug = new Map(Object.entries(meta).map(([k, v]) => [slugOf(k), v]));
    const info = isTemplate
      ? (tplMeta[slug] ? { title: `틀:${tplMeta[slug].title ?? slug}` } : null)
      : bySlug.get(slug);
    const header = info
      ? `<header class="article-header">
        <h1>${escapeHtml(info.title)}</h1>
        ${categoryLine(info.category, catDirs)}
      </header>`
      : '';

    // 인덱스를 못 불러왔으면 null로 두어 링크 존재 검사를 건너뜀
    const docs = bySlug.size ? new Set(bySlug.keys()) : null;
    const mdText = await mdRes.text();
    const templateMap = await loadTemplateMap(mdText, docs, slug);

    root.innerHTML = header
      + `<div class="article-body">${renderMarkdown(mdText, docs, templateMap, slug)}</div>`;

    fixRelativePaths(root);
    mergeTableCells(root);
    buildCallouts(root);
    addHeadingIds(root.querySelector('.article-body'));
    wrapTables(root);
    wrapImages(root.querySelector('.article-body'));

    if (location.hash) document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView();
  } catch (err) {
    root.innerHTML = `<p class="load-error">글을 불러오지 못했습니다. ${escapeHtml(err.message)}</p>`;
    console.error(err);
  }
}

main();
