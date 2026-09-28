import {
  renderMarkdown, fixRelativePaths, ensureKatexCss, escapeHtml, slugOf, toCategories, stripFrontmatter,
  WIKI_DIR, MD_DIR, ARTICLE_INDEX, CATEGORY_INDEX,
} from '/scripts/article.js';

// 목록 페이지(home.js, category.js)에서 쓰는 것들을 다시 내보냄
export { escapeHtml, CATEGORY_INDEX };

// ── 미리보기 관련 상수 ──
const OVERVIEW = /^#{1,6}[ \t]+(?:\d+\.[ \t]*)?개요[ \t]*$/m;   // '개요' 제목
const NEXT_HEADING = /^#{1,6}[ \t]/m;                              // 다음 제목
const TEMPLATE_LINE = /^[ \t]*\{\{[^{}\n]*\}\}[ \t]*\r?$/gm;       // 한 줄짜리 {{틀}}
const ICON_MAX_REM = 1.5;                                          // 미리보기에 남길 아이콘 최대 높이

// 문서 페이지 주소, 원본 .md 주소
const docUrl = slug => `${WIKI_DIR}${encodeURIComponent(slug)}/`;
const mdUrl = slug => `${MD_DIR}${encodeURIComponent(slug)}.md`;

// 배열에서 무작위로 하나 고름
export function pickOne(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// JSON을 불러오고, 실패 응답이면 예외
export async function loadJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} 응답 ${res.status}`);
  return res.json();
}

// 문서 인덱스 → [{ slug, title, categories }] 목록
export async function loadDocs() {
  const data = await loadJson(ARTICLE_INDEX);
  return Object.entries(data).map(([key, info]) => {
    const slug = slugOf(key);
    return { slug, title: String(info.title ?? slug), categories: toCategories(info.category) };
  });
}

// 미리보기용 원문: 머리말·틀 줄을 빼고, '개요' 절이 있으면 그 절만 남김
function previewSource(src) {
  let body = stripFrontmatter(src).replace(TEMPLATE_LINE, '');
  const m = OVERVIEW.exec(body);
  if (m) {
    body = body.slice(m.index + m[0].length);
    const next = NEXT_HEADING.exec(body);
    if (next) body = body.slice(0, next.index);
  }
  return body.trim();
}

// 이미지·수식을 제외한 모든 태그를 벗겨 텍스트만 남김 (재귀)
function unwrapFormatting(node) {
  for (const child of [...node.children]) {
    if (child.tagName === 'IMG' || child.classList.contains('katex')) continue;
    unwrapFormatting(child);
    child.replaceWith(...child.childNodes);
  }
}

// 원문 → 한 줄짜리 미리보기 노드 (최상위 문단만 이어 붙이고 큰 이미지·블록 수식·지도는 뺌)
function renderPreview(src, docs) {
  const tmp = document.createElement('div');
  tmp.innerHTML = renderMarkdown(previewSource(src), docs);
  fixRelativePaths(tmp);

  const out = document.createElement('div');
  for (const p of tmp.querySelectorAll(':scope > p')) {
    p.querySelectorAll('.math-display').forEach(el => el.replaceWith(' … '));
    p.querySelectorAll('iframe, br').forEach(el => el.replaceWith(' '));
    p.querySelectorAll('img').forEach(img => {
      const h = img.style.height;
      if (!(h.endsWith('rem') && parseFloat(h) <= ICON_MAX_REM)) img.replaceWith(' ');
    });
    unwrapFormatting(p);
    if (!p.textContent.trim() && !p.querySelector('img, .katex')) continue;
    if (out.hasChildNodes()) out.append(' ');
    out.append(...p.childNodes);
  }

  // 인접 텍스트 노드 합치고 양끝 공백 제거
  out.normalize();
  if (out.firstChild?.nodeType === Node.TEXT_NODE) out.firstChild.data = out.firstChild.data.trimStart();
  if (out.lastChild?.nodeType === Node.TEXT_NODE) out.lastChild.data = out.lastChild.data.trimEnd();
  return out;
}

// 카드 하나의 미리보기 채우기 (내용이 없거나 실패하면 미리보기 칸 제거)
async function fillPreview(el, docs) {
  try {
    const res = await fetch(mdUrl(el.dataset.slug));
    if (!res.ok) throw new Error(res.status);
    const out = renderPreview(await res.text(), docs);
    // 비어 있지 않은 문단만 out에 들어가므로, 자식이 있으면 곧 보여 줄 내용이 있다는 뜻
    if (out.hasChildNodes()) el.replaceChildren(...out.childNodes);
    else el.remove();
  } catch (err) {
    console.error(err);
    el.remove();
  }
}

// 문서 카드 목록 HTML. side(d)는 카드 오른쪽에 표시할 분류 이름
export function cardsHtml(docs, side) {
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

// root 안의 모든 미리보기 칸을 비동기로 채움 (docs: loadDocs() 결과)
export function fillPreviews(root, docs) {
  ensureKatexCss();
  const known = new Set(docs.map(d => d.slug));
  root.querySelectorAll('.post-preview').forEach(el => fillPreview(el, known));
}
