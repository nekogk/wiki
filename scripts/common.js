import { renderMarkdown, fixRelativePaths, MD_DIR, ARTICLE_INDEX, CATEGORY_INDEX } from '/scripts/article.js';

export { ARTICLE_INDEX, CATEGORY_INDEX };
export const WIKI_DIR = '/w/';

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function slugOf(key) {
  return key.split('/').filter(Boolean).pop();
}

export const docUrl = slug => `${WIKI_DIR}${encodeURIComponent(slug)}/`;
export const mdUrl = slug => `${MD_DIR}${encodeURIComponent(slug)}.md`;
export const assetDir = slug => `${MD_DIR}${encodeURIComponent(slug)}/`;

export function toCategories(value) {
  if (Array.isArray(value)) return value.filter(Boolean).map(String);
  return value ? [String(value)] : [];
}

export function pickOne(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export async function loadJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} 응답 ${res.status}`);
  return res.json();
}

export async function loadDocs() {
  const data = await loadJson(ARTICLE_INDEX);
  return Object.entries(data).map(([key, info]) => ({
    slug: slugOf(key),
    title: String(info.title ?? slugOf(key)),
    categories: toCategories(info.category),
  }));
}

const OVERVIEW = /^#{1,6}[ \t]+(?:\d+\.[ \t]*)?개요[ \t]*$/m;
const NEXT_HEADING = /^#{1,6}[ \t]/m;
const KATEX_CSS = 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css';
const ICON_MAX_REM = 1.5;

export function previewSource(src) {
  let body = src.replace(/^\uFEFF?---\r?\n[\s\S]*?\r?\n---\r?\n?/, '')
    .replace(/^[ \t]*\{\{[^{}\n]*\}\}[ \t]*\r?$/gm, '');
  const m = OVERVIEW.exec(body);
  if (m) {
    body = body.slice(m.index + m[0].length);
    const next = NEXT_HEADING.exec(body);
    if (next) body = body.slice(0, next.index);
  }
  return body.trim();
}

function unwrapFormatting(node) {
  for (const child of [...node.children]) {
    if (child.tagName === 'IMG' || child.classList.contains('katex')) continue;
    unwrapFormatting(child);
    child.replaceWith(...child.childNodes);
  }
}

export function renderPreview(src, docs, slug) {
  const base = assetDir(slug);
  const tmp = document.createElement('div');
  tmp.innerHTML = renderMarkdown(previewSource(src), base, docs);
  fixRelativePaths(tmp, base);

  const out = document.createElement('div');
  
  for (const p of tmp.querySelectorAll(':scope > p')) {
    p.querySelectorAll('.math-display').forEach(el => el.replaceWith(' … '));
    p.querySelectorAll('iframe').forEach(el => el.replaceWith(' '));
    p.querySelectorAll('img').forEach(img => {
      const h = img.style.height;
      if (!(h.endsWith('rem') && parseFloat(h) <= ICON_MAX_REM)) img.replaceWith(' ');
    });
    p.querySelectorAll('br').forEach(el => el.replaceWith(' '));
    unwrapFormatting(p);
    if (!p.textContent.trim() && !p.querySelector('img, .katex')) continue;
    if (out.childNodes.length) out.append(' ');
    out.append(...p.childNodes);
  }
  
  out.normalize();
  if (out.firstChild?.nodeType === 3) out.firstChild.data = out.firstChild.data.trimStart();
  if (out.lastChild?.nodeType === 3) out.lastChild.data = out.lastChild.data.trimEnd();
  return out;
}

async function fillPreview(el, docs) {
  try {
    const res = await fetch(mdUrl(el.dataset.slug));
    if (!res.ok) throw new Error(res.status);
    const out = renderPreview(await res.text(), docs, el.dataset.slug);
    if (out.textContent.trim() || out.querySelector('img')) el.replaceChildren(...out.childNodes);
    else el.remove();
  } catch (err) {
    console.error(err);
    el.remove();
  }
}

export function cardsHtml(docs, side = () => '') {
  return `
        <ol class="post-cards">
          ${docs.map(d => {
            const s = side(d);
            return `
          <li>
            <a class="post-card" href="${docUrl(d.slug)}">
              <div class="post-head">
                <h3 class="post-title">${escapeHtml(d.title)}</h3>
                ${s ? `<span class="post-category">${escapeHtml(s)}</span>` : ''}
              </div>
              <p class="post-preview" data-slug="${escapeHtml(d.slug)}"></p>
            </a>
          </li>`;
          }).join('')}
        </ol>`;
}

export function fillPreviews(root, docs = null) {
  if (!document.querySelector(`link[href="${KATEX_CSS}"]`)) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = KATEX_CSS;
    document.head.append(link);
  }
  const known = docs ? new Set(docs.map(d => d.slug)) : null;
  root.querySelectorAll('.post-preview').forEach(el => fillPreview(el, known));
}
