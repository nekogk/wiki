// ── 테마 ──
// <head>에서 일반 스크립트로 불러서, 화면이 그려지기 전에 <html data-theme="light|dark">를 정함
// 버튼(사이드바, 64rem 이상에서만 보임)으로 시스템·라이트·다크 선택 → localStorage에 저장
// 고른 값은 화면 너비와 상관없이 유지됨. 한 번도 안 골랐으면 시스템 설정
(() => {
  const KEY = 'theme';
  const CHOICES = ['system', 'light', 'dark'];
  const root = document.documentElement;
  const systemDark = matchMedia('(prefers-color-scheme: dark)');

  let choice = 'system';
  try {
    const saved = localStorage.getItem(KEY);
    if (CHOICES.includes(saved)) choice = saved;
  } catch {}

  // 실제로 적용할 테마
  function effective() {
    return choice === 'system' ? (systemDark.matches ? 'dark' : 'light') : choice;
  }

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

  // 다른 탭에서 바꾸면 따라감
  addEventListener('storage', e => {
    if (e.key !== KEY) return;
    choice = CHOICES.includes(e.newValue) ? e.newValue : 'system';
    apply();
  });

  window.wikiTheme = { sync: syncButtons, current: () => root.dataset.theme };
  apply();
})();
