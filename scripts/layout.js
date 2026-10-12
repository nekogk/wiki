import { initSearch } from '/scripts/search.js';

export const SITE_NAME = '다냐위키';
const COPYRIGHT = '© 2026 Raeyon Kim. All rights reserved.';

// 이 너비 이상이면 컨테이너 오른쪽에 사이드바(검색창·목차)를 띄움
// 48rem(컨테이너) + 2rem + 12rem + 2rem = 64rem
const WIDE = matchMedia('(min-width: 64rem)');

function headerHtml() {
  return `
    <header class="site-header">
      <a href="/" class="site-logo">
        <img src="/icon.svg" alt="">
        <span>${SITE_NAME}</span>
      </a>
    </header>`;
}

function footerHtml() {
  return `
    <footer>
      <p>${COPYRIGHT}</p>
    </footer>`;
}

function sideHtml() {
  return `
  <aside class="site-side">
    <div class="site-side-inner">
      <div class="site-side-search"></div>
      <nav class="site-toc" aria-label="목차" hidden></nav>
    </div>
  </aside>`;
}

// 넓은 화면이면 검색창을 사이드바로, 아니면 머리글로 옮김 (요소 하나를 옮기므로 입력 내용·상태가 유지됨)
function placeSearch(header, slot) {
  const box = document.querySelector('.site-search');
  if (!box) return;
  const target = WIDE.matches ? slot : header;
  if (box.parentElement === target) return;
  const focused = box.contains(document.activeElement);
  target.append(box);
  if (focused) box.querySelector('input')?.focus();
}

// ── 목차 ──
// article.js가 본문을 다 그린 뒤 setToc(본문)을 부름. 사이드바가 아직 없으면 기억해 두었다가 그림
let tocSource = null;

export function setToc(body) {
  tocSource = body;
  renderToc();
}

function renderToc() {
  const nav = document.querySelector('.site-toc');
  if (!nav) return;

  // 본문의 h2–h6 중 article.js가 번호를 붙인 것 (틀 안의 제목은 번호가 없어서 빠짐)
  const heads = tocSource ? [...tocSource.querySelectorAll('h2[data-num], h3[data-num], h4[data-num], h5[data-num], h6[data-num]')] : [];
  if (!heads.length) {
    nav.hidden = true;
    nav.replaceChildren();
    return;
  }

  const ol = document.createElement('ol');
  ol.className = 'site-toc-list';
  for (const h of heads) {
    const num = h.dataset.num;
    const text = h.dataset.title ?? h.textContent.trim();

    const li = document.createElement('li');
    li.className = 'site-toc-item';
    li.style.setProperty('--depth', h.dataset.depth ?? 0);

    const a = document.createElement('a');
    a.href = `#${encodeURIComponent(h.id)}`;
    a.title = `${num} ${text}`;

    const numEl = document.createElement('span');
    numEl.className = 'site-toc-num';
    numEl.textContent = num;
    const textEl = document.createElement('span');
    textEl.className = 'site-toc-text';
    textEl.textContent = text;

    a.append(numEl, textEl);
    li.append(a);
    ol.append(li);
  }
  nav.replaceChildren(ol);
  nav.hidden = false;
}

function initLayout() {
  const container = document.querySelector('.container');
  if (!container) return;

  if (!container.querySelector(':scope > .site-header')) container.insertAdjacentHTML('afterbegin', headerHtml());
  if (!container.querySelector(':scope > footer')) container.insertAdjacentHTML('beforeend', footerHtml());

  const header = container.querySelector(':scope > .site-header');
  initSearch(header);

  if (!document.querySelector('.site-side')) container.insertAdjacentHTML('afterend', sideHtml());
  const side = document.querySelector('.site-side');
  const slot = side.querySelector('.site-side-search');

  placeSearch(header, slot);
  WIDE.addEventListener('change', () => placeSearch(header, slot));
  renderToc();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initLayout);
else initLayout();
