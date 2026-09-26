// 홈: /w/index.json에서 문서를 무작위로 최대 10개 뽑아 카드로 보여준다.

import { loadDocs, loadJson, cardsHtml, fillPreviews, pickOne } from '/scripts/common.js';

const RANDOM_COUNT = 1024;   // 홈에 보여줄 랜덤 글 최대 개수

const listEl = document.getElementById('post-list');

// 피셔-예이츠 셔플로 섞은 뒤 앞에서 n개
function sample(arr, n) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
}

async function main() {
  try {
    const [docs, cats] = await Promise.all([loadDocs(), loadJson('/c/index.json')]);
    if (!docs.length) {
      listEl.innerHTML = '<p class="list-message">아직 올라온 글이 없습니다</p>';
      return;
    }

    // 카드 오른쪽 뱃지: 분류 슬러그를 c/index.json에서 한글 이름으로 바꿔 보여준다
    const catName = slug => cats[slug] ?? slug;

    listEl.innerHTML = `
      <section class="post-section">
        <h2 class="section-label">랜덤 글</h2>
        ${cardsHtml(sample(docs, RANDOM_COUNT), d => (d.categories.length ? catName(pickOne(d.categories)) : ''))}
      </section>`;
    fillPreviews(listEl, docs);
  } catch (err) {
    listEl.innerHTML = '<p class="list-message">글 목록을 불러오지 못했습니다</p>';
    console.error(err);
  }
}

main();
