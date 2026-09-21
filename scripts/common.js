// 홈(home.js)과 카테고리 페이지(category.js)가 같이 쓰는 코드

import { renderMarkdown, fixRelativePaths } from '/scripts/article.js';

export const WIKI_DIR = '/w/';

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// index.json 키 → 문서 이름. "rushichi"든 "/w/rushichi/"든 마지막 조각만 쓴다
export function slugOf(key) {
  return key.split('/').filter(Boolean).pop();
}

export const docUrl = slug => `${WIKI_DIR}${encodeURIComponent(slug)}/`;      // /w/rushichi/
export const mdUrl = slug => `${WIKI_DIR}${encodeURIComponent(slug)}.md`;     // /w/rushichi.md

// category는 "문자열" 하나여도, ["여러", "개"] 배열이어도 된다
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

// /w/index.json → [{ slug, title, categories }]
export async function loadDocs() {
  const data = await loadJson(`${WIKI_DIR}index.json`);
  return Object.entries(data).map(([key, info]) => ({
    slug: slugOf(key),
    title: String(info.title ?? slugOf(key)),
    categories: toCategories(info.category),
  }));
}

// ---------- 미리보기 ----------
// "# 개요"(또는 "# 1. 개요") 아래부터 다음 # 제목 전까지를 마크다운으로 렌더링해 보여준다.
// 글자 수로 자르지 않는다. 화면에서는 CSS가 3줄까지만 보여주고 넘치면 …으로 줄인다.
// (개요 위에는 표가 있으므로 건너뜀. 개요 제목이 없으면 프론트매터만 떼고 처음부터)

const OVERVIEW = /^#{1,6}[ \t]+(?:\d+\.[ \t]*)?개요[ \t]*$/m;
const NEXT_HEADING = /^#{1,6}[ \t]/m;
const KATEX_CSS = 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css';
const ICON_MAX_REM = 1.5;   // 이 높이(rem) 이하로 지정한 이미지는 아이콘으로 보고 미리보기에 남긴다

export function previewSource(src) {
  let body = src.replace(/^\uFEFF?---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
  const m = OVERVIEW.exec(body);
  if (m) {
    body = body.slice(m.index + m[0].length);
    const next = NEXT_HEADING.exec(body);
    if (next) body = body.slice(0, next.index);
  }
  return body.trim();
}

// 마크다운 기호는 이미 렌더링으로 사라졌고, 남은 꾸밈(링크, 볼드, 기울임, 하이라이트, 코드,
// 취소선, 직접 쓴 HTML 등)의 태그를 벗겨 평범한 글자로 만든다. 수식과 아이콘만 남긴다
function unwrapFormatting(node) {
  for (const child of [...node.children]) {
    if (child.tagName === 'IMG' || child.classList.contains('katex')) continue;
    unwrapFormatting(child);
    child.replaceWith(...child.childNodes);
  }
}

export function renderPreview(src, docs, slug) {
  const base = docUrl(slug);   // 문서 폴더의 이미지도 찾을 수 있게
  const tmp = document.createElement('div');
  tmp.innerHTML = renderMarkdown(previewSource(src), base, docs);
  fixRelativePaths(tmp, base);

  const out = document.createElement('div');
  // 문단만 쓴다: 표·목록·콜아웃·코드 블록은 건너뜀
  for (const p of tmp.querySelectorAll(':scope > p')) {
    p.querySelectorAll('.math-display').forEach(el => el.replaceWith(' … '));
    p.querySelectorAll('iframe').forEach(el => el.replaceWith(' '));   // 지도는 미리보기에서 뺌
    p.querySelectorAll('img').forEach(img => {
      const h = img.style.height;
      if (!(h.endsWith('rem') && parseFloat(h) <= ICON_MAX_REM)) img.replaceWith(' ');
    });
    p.querySelectorAll('br').forEach(el => el.replaceWith(' '));
    unwrapFormatting(p);   // 링크·볼드·하이라이트 등은 꾸밈 없이 글자만
    if (!p.textContent.trim() && !p.querySelector('img, .katex')) continue;
    if (out.childNodes.length) out.append(' ');
    out.append(...p.childNodes);
  }
  // 앞뒤 공백 정리 (이미지를 뺀 자리 등)
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
    el.remove();   // 미리보기를 못 불러와도 제목 카드는 그대로 둔다
  }
}

// 카드 목록 HTML. side(doc)가 문자열을 돌려주면 제목 오른쪽에 회색으로 표시
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

// 카드를 그린 뒤 호출: 미리보기는 도착하는 대로 채운다.
// docs(loadDocs 결과)를 넘기면 없는 문서로 가는 위키링크를 회색으로 표시한다
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
