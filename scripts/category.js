import { escapeHtml, loadJson, loadDocs, cardsHtml, fillPreviews, pickOne, CATEGORY_INDEX } from '/scripts/common.js';

const listEl = document.getElementById('post-list');

// 한글 초성 표 (완성형 음절 순서), 된소리는 예사소리 묶음으로 합침
const CHOSEONG = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
const MERGE = { 'ㄲ': 'ㄱ', 'ㄸ': 'ㄷ', 'ㅃ': 'ㅂ', 'ㅆ': 'ㅅ', 'ㅉ': 'ㅈ' };
const OTHER = '기타';
const collator = new Intl.Collator('ko');

// 제목 첫 글자로 묶음 이름 결정: 한글은 초성, 영문은 대문자, 나머지는 '기타'
function groupLabel(title) {
  let ch = Array.from(title.trim())[0] ?? '';
  const code = ch.codePointAt(0);   // 빈 제목이면 undefined → 아래 비교가 모두 false
  if (code >= 0xac00 && code <= 0xd7a3) ch = CHOSEONG[Math.floor((code - 0xac00) / 588)];
  if (CHOSEONG.includes(ch)) return MERGE[ch] ?? ch;
  if (/[a-z]/i.test(ch)) return ch.toUpperCase();
  return OTHER;
}

// 분류 페이지: 폴더 이름의 분류에 속한 문서를 초성별로 묶어 표시
async function main() {
  const folder = decodeURIComponent(location.pathname.split('/').filter(Boolean).pop() ?? '');

  try {
    const [cats, docs] = await Promise.all([loadJson(CATEGORY_INDEX), loadDocs()]);
    const name = cats[folder]?.title;
    if (!name) {
      listEl.innerHTML = '<p class="list-message">알 수 없는 분류입니다</p>';
      return;
    }

    // 카드 옆에는 현재 분류를 뺀 다른 분류 중 하나를 표시
    const otherCategory = d => {
      const others = d.categories.filter(c => c !== folder);
      return others.length ? cats[pickOne(others)]?.title ?? '' : '';
    };

    const members = docs
      .filter(d => d.categories.includes(folder))
      .sort((a, b) => collator.compare(a.title, b.title));

    if (!members.length) {
      listEl.innerHTML = `<h1 class="page-title">${escapeHtml(name)}</h1><p class="list-message">이 분류에는 아직 문서가 없습니다</p>`;
      return;
    }

    // 초성별로 묶고 '기타'는 맨 뒤로
    const groups = new Map();
    for (const d of members) {
      const label = groupLabel(d.title);
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label).push(d);
    }
    const rest = groups.get(OTHER);
    if (rest) {
      groups.delete(OTHER);
      groups.set(OTHER, rest);
    }

    listEl.innerHTML = `<h1 class="page-title">${escapeHtml(name)}</h1>` + [...groups].map(([label, list]) => `
      <section class="post-section">
        <h2 class="section-label">${escapeHtml(label)}</h2>
        ${cardsHtml(list, otherCategory)}
      </section>`).join('');
    fillPreviews(listEl, docs);
  } catch (err) {
    listEl.innerHTML = '<p class="list-message">문서 목록을 불러오지 못했습니다</p>';
    console.error(err);
  }
}

main();
