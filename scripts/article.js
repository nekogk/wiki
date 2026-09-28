import markdownit from 'https://cdn.jsdelivr.net/npm/markdown-it@14.1.0/+esm';
import katex from 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.mjs';

const KATEX_CSS = 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css';

const MATH_OPEN = '\uE000', MATH_CLOSE = '\uE001';
const CODE_OPEN = '\uE002', CODE_CLOSE = '\uE003';
const HTML_OPEN = '\uE004', HTML_CLOSE = '\uE005';
const BLOCK_OPEN = '\uE006', BLOCK_CLOSE = '\uE007';

const md = markdownit({
  html: true,
  linkify: true,
  typographer: false,
  breaks: true,
});

md.core.ruler.push('shift_headings', state => {
  for (const t of state.tokens) {
    if (t.type === 'heading_open' || t.type === 'heading_close') {
      t.tag = 'h' + Math.min(Number(t.tag.slice(1)) + 1, 6);
    }
  }
});

function stripFrontmatter(src) {
  return src.replace(/^\uFEFF?---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
}

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
export const MD_DIR = '/articles/';
export const ARTICLE_INDEX = '/indexes/article.json';
export const CATEGORY_INDEX = '/indexes/category.json';
let knownDocs = null;

function wikiTargetSlug(target) {
  const pathPart = target.split('#')[0].trim();
  if (!pathPart) return null;
  return pathPart.replace(/\.md$/, '').split('/').pop();
}

function resolveWikiTarget(target) {
  const [pathPart, heading] = target.split('#');
  const hash = heading ? '#' + headingId(heading) : '';
  if (!pathPart.trim()) return hash;
  const slug = wikiTargetSlug(target);
  if (knownDocs && !knownDocs.has(slug)) return null;
  return `${WIKI_DIR}${encodeURIComponent(slug)}/${hash}`;
}

function sizeStyle(opt) {
  const m = (opt ?? '').trim().match(/^(\d+)(?:x(\d+))?$/);
  if (!m) return null;
  const rem = n => `${Number((Number(n) / 16).toFixed(4))}rem`;
  return m[2]
    ? `width: ${rem(m[1])}; aspect-ratio: ${m[1]} / ${m[2]};`
    : `max-height: ${rem(m[1])}; height: auto;`;
}

const MAP_URL = 'https://sluqecu.dacordia.com/';
const MAP_EMBED = /!\[\[map:\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*(?:,\s*(-?[\d.]+)\s*)?(?:\\?\|\s*([^\]]*?)\s*)?\]\]/g;

function mapStyle(opt) {
  const m = (opt ?? '').match(/^(\d+)(?:x(\d+))?$/);
  if (!m) return '';
  const rem = n => `${Number((Number(n) / 16).toFixed(4))}rem`;
  return m[2]
    ? ` style="width: ${rem(m[1])}; aspect-ratio: ${m[1]} / ${m[2]};"`
    : ` style="max-height: ${rem(m[1])}; height: auto;"`;
}

function mapIframe(lat, lng, zoom, opt) {
  const z = zoom ?? '0';
  const src = `${MAP_URL}?at=${lat},${lng}&z=${z}&embed=1`;
  return `<iframe class="map-embed" src="${src}"${mapStyle(opt)} loading="lazy" title="Map (${lat}, ${lng})"></iframe>`;
}

function assetCandidates(src) {
  if (/^([a-z][a-z0-9+.-]*:|\/|#)/i.test(src)) return [src];
  const clean = decodeURIComponent(src);
  if (clean.includes('/')) return MD_DIR + encodePath(clean);
  return `${MD_DIR}assets/${encodePath(clean)}`;
}

function attachFallback(img) {
  img.addEventListener('error', () => {
    const list = (img.dataset.fallback ?? '').split(' ').filter(Boolean);
    if (!list.length) return;
    img.dataset.fallback = list.slice(1).join(' ');
    img.src = list[0];
  });
}

function transformText(text, base, maths, htmls, blocks, templates, selfSlug) {
  const codes = [];
  const keep = h => { htmls.push(h); return HTML_OPEN + (htmls.length - 1) + HTML_CLOSE; };

  text = text.replace(/%%[\s\S]*?%%/g, '');

  text = text.replace(/^[ \t]*\{\{\s*([^{}\n]+?)\s*\}\}[ \t]*$/gm, (whole, name) => {
    const html = templates?.get(name);
    if (html) {
      blocks.push(html);
      return BLOCK_OPEN + (blocks.length - 1) + BLOCK_CLOSE;
    }
    return keep(`<span class="wikilink-unresolved">틀 없음: ${escapeHtml(name)}</span>`);
  });

  text = text.replace(/(`+)([\s\S]*?[^`])\1(?!`)/g, m => {
    codes.push(m);
    return CODE_OPEN + (codes.length - 1) + CODE_CLOSE;
  });

  text = text.replace(/\$\$([\s\S]+?)\$\$/g, (_, tex) => {
    tex = tex.replace(/^[ \t]*>[ \t]?/gm, '');
    maths.push({ tex, display: true });
    return MATH_OPEN + (maths.length - 1) + MATH_CLOSE;
  });

  text = text.replace(/(^|[^\\$])\$(?=\S)((?:\\.|[^$\\\n])+?)(?<=\S)\$(?!\d)/g, (_, pre, tex) => {
    maths.push({ tex, display: false });
    return pre + MATH_OPEN + (maths.length - 1) + MATH_CLOSE;
  });

  text = text.replace(MAP_EMBED, (_, lat, lng, zoom, opt) => keep(mapIframe(lat, lng, zoom, opt)));

  text = text.replace(/!\[\[([^\]]+)\]\]/g, (_, inner) => {
    const [target, opt] = inner.split(/\\?\|/);
    const name = target.trim();
    if (IMAGE_EXT.test(name)) {
      const style = sizeStyle(opt);
      const alt = opt && !style ? opt.trim() : '';
      return keep(`<img src="${assetCandidates(name)}" alt="${escapeHtml(alt)}"${style ? ` style="${style}"` : ''} loading="lazy">`);
    }
    const label = escapeHtml(opt ? opt.trim() : name);
    if (selfSlug && wikiTargetSlug(name) === selfSlug) return keep(`<strong>${label}</strong>`);
    const href = resolveWikiTarget(name);
    return keep(href !== null ? `<a href="${href}">${label}</a>` : label);
  });

  text = text.replace(/\[\[([^\]]+)\]\]/g, (_, inner) => {
    const [target, alias] = inner.split(/\\?\|/);
    const trimmed = target.trim();
    const label = escapeHtml((alias ?? trimmed.split('#').pop().split('/').pop()).trim());
    if (selfSlug && wikiTargetSlug(trimmed) === selfSlug) return keep(`<strong>${label}</strong>`);
    const href = resolveWikiTarget(trimmed);
    return keep(href !== null ? `<a href="${href}">${label}</a>` : `<span class="wikilink-unresolved">${label}</span>`);
  });

  text = text.replace(/==([^=\n]+)==/g, (_, inner) => keep('<mark>') + inner + keep('</mark>'));

  text = text.replace(new RegExp(CODE_OPEN + '(\\d+)' + CODE_CLOSE, 'g'), (_, i) => codes[+i]);
  return text;
}

function restorePlaceholders(html, maths, htmls, blocks) {
  html = html.replace(new RegExp(`${HTML_OPEN}(\\d+)${HTML_CLOSE}`, 'g'), (_, i) => htmls[+i]);
  const render = (i, forceDisplay) => {
    const { tex, display } = maths[+i];
    const out = katex.renderToString(tex.trim(), { displayMode: display || forceDisplay, throwOnError: false });
    return display ? `<span class="math-display">${out}</span>` : out;
  };
  html = html.replace(new RegExp(`(?:<br>\\s*)?(${MATH_OPEN}(\\d+)${MATH_CLOSE})(?:\\s*<br>)?`, 'g'),
    (whole, ph, i) => (maths[+i].display ? ph : whole));

  html = html.replace(new RegExp(`<p>${MATH_OPEN}(\\d+)${MATH_CLOSE}</p>`, 'g'), (_, i) => render(i));
  html = html.replace(new RegExp(`${MATH_OPEN}(\\d+)${MATH_CLOSE}`, 'g'), (_, i) => render(i));

  html = html.replace(new RegExp(`<p>${BLOCK_OPEN}(\\d+)${BLOCK_CLOSE}</p>`, 'g'), (_, i) => blocks[+i]);
  return html.replace(new RegExp(`${BLOCK_OPEN}(\\d+)${BLOCK_CLOSE}`, 'g'), (_, i) => blocks[+i]);
}

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

function isMarker(cell, mark) {
  return cell.children.length === 0 && cell.textContent.trim() === mark;
}

function mergeTableCells(root) {
  for (const table of root.querySelectorAll('table')) {
    const rows = [...table.rows];

    for (const row of rows) {
      let left = null;
      for (const cell of [...row.cells]) {
        if (left && isMarker(cell, '<')) { left.colSpan += 1; cell.remove(); }
        else left = cell;
      }
    }

    const owner = [];

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

function categoryLine(value, catDirs) {
  const slugs = (Array.isArray(value) ? value : [value]).filter(Boolean).map(String);
  if (!slugs.length) return '';
  const items = slugs.map(slug => {
    const name = catDirs[slug];
    return name ? `<a href="/c/${encodeURIComponent(slug)}/">${escapeHtml(name)}</a>` : escapeHtml(slug);
  });
  return `<p class="article-meta">분류: ${items.join(', ')}</p>`;
}

export function fixRelativePaths(root, base = null) {
  for (const img of root.querySelectorAll('img[src]')) {
    if (img.dataset.fallback) attachFallback(img);
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

async function loadTemplate(name, docs, selfSlug) {
  try {
    const res = await fetch(`${MD_DIR}${encodeURIComponent(name)}.md`);
    if (!res.ok) throw new Error(`${res.status}`);
    const html = renderMarkdown(await res.text(), `${MD_DIR}${encodeURIComponent(name)}/`, docs, null, selfSlug);
    return `<div class="article-body wiki-template" data-template="${escapeHtml(name)}">${html}</div>`;
  } catch (err) {
    console.error(`틀을 불러오지 못했습니다: ${name}`, err);
    return null;
  }
}

function extractInlineTemplateNames(src) {
  const names = [];
  mapOutsideFences(stripFrontmatter(src), block => {
    for (const m of block.matchAll(/^[ \t]*\{\{\s*([^{}\n]+?)\s*\}\}[ \t]*$/gm)) names.push(m[1].trim());
    return block;   // 내용은 바꾸지 않고, 이름만 훑어 모은다
  });
  return names;
}

async function loadTemplateMap(names, docs, selfSlug) {
  const uniq = [...new Set(names.filter(Boolean))];
  const map = new Map();
  await Promise.all(uniq.map(async name => map.set(name, await loadTemplate(name, docs, selfSlug))));
  return map;
}

export function renderMarkdown(src, base, docs = null, templates = null, selfSlug = null) {
  knownDocs = docs;
  const maths = [], htmls = [], blocks = [];
  const pre = mapOutsideFences(stripFrontmatter(src), t => transformText(t, base, maths, htmls, blocks, templates, selfSlug));
  return restorePlaceholders(md.render(pre), maths, htmls, blocks);
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

  const page = location.pathname.replace(/\/?$/, '/');   // 항상 "/w/rushichi/" 형태
  const slug = decodeURIComponent(page.split('/').filter(Boolean).pop() ?? '');
  const base = `${MD_DIR}${encodeURIComponent(slug)}/`;    // 이 문서의 이미지 폴더
  const getJson = url => fetch(url).then(r => (r.ok ? r.json() : {})).catch(() => ({}));

  try {
    const [mdRes, meta, catDirs] = await Promise.all([
      fetch(`${MD_DIR}${encodeURIComponent(slug)}.md`),
      getJson(ARTICLE_INDEX),
      getJson(CATEGORY_INDEX),
    ]);
    if (!mdRes.ok) throw new Error(`${slug}.md를 찾을 수 없습니다 (${mdRes.status})`);

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
    const mdText = await mdRes.text();
    const templateMap = await loadTemplateMap(extractInlineTemplateNames(mdText), docs, slug);

    root.innerHTML = header
      + `<div class="article-body">${renderMarkdown(mdText, base, docs, templateMap)}</div>`;

    fixRelativePaths(root, base);
    mergeTableCells(root);
    buildCallouts(root);
    addHeadingIds(root.querySelector('.article-body'));

    for (const t of root.querySelectorAll('table')) {
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
