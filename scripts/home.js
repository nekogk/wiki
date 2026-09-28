import { loadDocs, loadJson, cardsHtml, fillPreviews, pickOne, CATEGORY_INDEX } from '/scripts/common.js';

const RANDOM_COUNT = 1024;
const listEl = document.getElementById('post-list');

// 배열에서 무작위로 n개 뽑음 (앞쪽 n칸만 섞는 부분 피셔-예이츠, 원본은 그대로)
function sample(arr, n) {
  const a = arr.slice();
  const k = Math.min(n, a.length);
  for (let i = 0; i < k; i++) {
    const j = i + Math.floor(Math.random() * (a.length - i));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, k);
}

// 홈: 무작위 문서 카드 목록 표시
async function main() {
  try {
    const [docs, cats] = await Promise.all([loadDocs(), loadJson(CATEGORY_INDEX)]);
    if (!docs.length) {
      listEl.innerHTML = '<p class="list-message">아직 올라온 글이 없습니다</p>';
      return;
    }

    // 카드 옆에는 문서의 분류 중 하나를 무작위로 표시
    const side = d => {
      if (!d.categories.length) return '';
      const c = pickOne(d.categories);
      return cats[c] ?? c;
    };

    listEl.innerHTML = `
      <section class="post-section">
        <h2 class="section-label">랜덤 글</h2>
        ${cardsHtml(sample(docs, RANDOM_COUNT), side)}
      </section>`;
    fillPreviews(listEl, docs);
  } catch (err) {
    listEl.innerHTML = '<p class="list-message">글 목록을 불러오지 못했습니다</p>';
    console.error(err);
  }
}

main();
