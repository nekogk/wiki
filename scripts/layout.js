import { initSearch } from '/scripts/search.js';

const SITE_NAME = '圖孃維基';
const COPYRIGHT = '© 2026 Raeyon Kim. All rights reserved.';

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

function initLayout() {
  const container = document.querySelector('.container');
  if (!container) return;

  if (!container.querySelector(':scope > .site-header')) container.insertAdjacentHTML('afterbegin', headerHtml());
  if (!container.querySelector(':scope > footer')) container.insertAdjacentHTML('beforeend', footerHtml());

  initSearch(container.querySelector(':scope > .site-header'));
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initLayout);
else initLayout();
