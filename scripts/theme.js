// ── 테마 ──
// <head>에서 일반 스크립트로 불러서, 화면이 그려지기 전에 <html data-theme="light|dark">를 정함
// 64rem 미만: 항상 시스템 설정 / 64rem 이상: 사이드바 버튼으로 시스템·라이트·다크 선택 (localStorage에 저장)
(() => {
  const KEY = 'theme';
  const CHOICES = ['system', 'light', 'dark'];
  const root = document.documentElement;
  const systemDark = matchMedia('(prefers-color-scheme: dark)');
  const WIDE = matchMedia('(min-width: 64rem)');

  let choice = 'system';
  try {
    const saved = localStorage.getItem(KEY);
    if (CHOICES.includes(saved)) choice = saved;
  } catch {}

  // 실제로 적용할 테마
  function effective() {
    const c = WIDE.matches ? choice : 'system';
    return c === 'system' ? (systemDark.matches ? 'dark' : 'light') : c;
  }

  // ── 라이트 모드에서 ..._white.png → ....png ──
  // data-orig-src: 원래 주소, data-theme-src: 테마에 맞춰 넣은 주소
  // 다른 코드가 src를 바꾸면 (theme-src와 달라지면) 그 주소를 새 원본으로 봄
  const WHITE = /_white\.png(?=$|[?#])/i;

  function swapImg(img) {
    const cur = img.getAttribute('src');
    if (!cur) return;
    if (img.dataset.themeSrc !== cur) delete img.dataset.origSrc;
    const orig = img.dataset.origSrc ?? cur;
    if (!WHITE.test(orig)) return;
    const want = root.dataset.theme === 'light' ? orig.replace(WHITE, '.png') : orig;
    img.dataset.origSrc = orig;
    img.dataset.themeSrc = want;
    if (cur !== want) img.setAttribute('src', want);
  }

  function swapAll(node) {
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    if (node.tagName === 'IMG') swapImg(node);
    else node.querySelectorAll('img').forEach(swapImg);
  }

  // 나중에 그려지는 본문·미리보기 이미지도 잡음
  new MutationObserver(records => {
    for (const r of records) {
      if (r.type === 'attributes') swapImg(r.target);
      else r.addedNodes.forEach(swapAll);
    }
  }).observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });

  // ── 지도 임베드: 새로고침 없이 테마 전달 ──
  function postMaps(theme) {
    for (const f of document.querySelectorAll('iframe.map-embed')) {
      try {
        f.contentWindow?.postMessage({ theme }, new URL(f.src).origin);
      } catch {}
    }
  }

  // ── 버튼 ──
  function syncButtons() {
    for (const b of document.querySelectorAll('.theme-btn[data-theme-choice]')) {
      const on = b.dataset.themeChoice === choice;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', String(on));
    }
  }

  function apply() {
    const theme = effective();
    if (root.dataset.theme !== theme) {
      root.dataset.theme = theme;
      swapAll(root);
      postMaps(theme);
    }
    syncButtons();
  }

  function setChoice(c) {
    if (!CHOICES.includes(c)) return;
    choice = c;
    try { localStorage.setItem(KEY, c); } catch {}
    apply();
  }

  document.addEventListener('click', e => {
    const b = e.target.closest?.('.theme-btn[data-theme-choice]');
    if (b) setChoice(b.dataset.themeChoice);
  });

  systemDark.addEventListener('change', apply);
  WIDE.addEventListener('change', apply);

  // 다른 탭에서 바꾸면 따라감
  addEventListener('storage', e => {
    if (e.key !== KEY) return;
    choice = CHOICES.includes(e.newValue) ? e.newValue : 'system';
    apply();
  });

  window.wikiTheme = { sync: syncButtons, current: () => root.dataset.theme };
  apply();
})();
