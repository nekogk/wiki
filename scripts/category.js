// 카테고리 페이지(/c/폴더/): 그 카테고리의 문서를 제목 가나다순으로 정렬하고
// 첫 글자의 초성(ㄱ, ㄴ, ㄷ …)별로 묶어 보여준다.

import { escapeHtml, loadJson, loadDocs, cardsHtml, fillPreviews, pickOne } from '/scripts/common.js';

const listEl = document.getElementById('post-list');

const CHOSEONG = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
const MERGE = { 'ㄲ': 'ㄱ', 'ㄸ': 'ㄷ', 'ㅃ': 'ㅂ', 'ㅆ': 'ㅅ', 'ㅉ': 'ㅈ' };   // 된소리는 예사소리 묶음에
const OTHER = '기타';

// 제목 첫 글자 → 묶음 이름
export function groupLabel(title) {
  const ch = Array.from(title.trim())[0] ?? '';
  const code = ch.codePointAt(0) ?? 0;
  let label;
  if (code >= 0xac00 && code <= 0xd7a3) label = CHOSEONG[Math.floor((code - 0xac00) / 588)];   // 완성형 한글
  else if (CHOSEONG.includes(ch)) label = ch;                                                    // 자모만 있는 경우
  else if (/[a-z]/i.test(ch)) return ch.toUpperCase();                                           // 로마자
  else return OTHER;
  return MERGE[label] ?? label;
}

const collator = new Intl.Collator('ko');

async function main() {
  const folder = decodeURIComponent(location.pathname.split('/').filter(Boolean).pop() ?? '');

  try {
    const [cats, docs] = await Promise.all([loadJson('/c/index.json'), loadDocs()]);
    const name = cats[folder];
    if (!name) {
      listEl.innerHTML = '<p class="list-message">알 수 없는 분류입니다</p>';
      return;
    }

    // 카드 오른쪽: 이 분류를 뺀 나머지 분류 중 하나를 무작위로 (없으면 표시 안 함)
    const otherCategory = d => {
      const others = d.categories.filter(c => c !== name);
      return others.length ? pickOne(others) : '';
    };

    const members = docs
      .filter(d => d.categories.includes(name))
      .sort((a, b) => collator.compare(a.title, b.title));

    // 정렬 순서대로 묶되, '기타'는 맨 뒤로
    const groups = new Map();
    for (const d of members) {
      const label = groupLabel(d.title);
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label).push(d);
    }
    if (groups.has(OTHER)) {
      const rest = groups.get(OTHER);
      groups.delete(OTHER);
      groups.set(OTHER, rest);
    }

    listEl.innerHTML = `<h1 class="page-title">${escapeHtml(name)}</h1>` + (members.length
      ? [...groups].map(([label, list]) => `
      <section class="post-section">
        <h2 class="section-label">${escapeHtml(label)}</h2>
        ${cardsHtml(list, otherCategory)}
      </section>`).join('')
      : '<p class="list-message">이 분류에는 아직 문서가 없습니다</p>');
    fillPreviews(listEl, docs);
  } catch (err) {
    listEl.innerHTML = '<p class="list-message">문서 목록을 불러오지 못했습니다</p>';
    console.error(err);
  }
}

main();
