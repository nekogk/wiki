// 홈: /w/index.json에서 문서를 무작위로 최대 10개 뽑아 카드로 보여준다.

import { loadDocs, cardsHtml, fillPreviews, pickOne } from '/scripts/common.js';

const RANDOM_COUNT = 10;   // 홈에 보여줄 랜덤 글 최대 개수

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
    const docs = await loadDocs();
    if (!docs.length) {
      listEl.innerHTML = '<p class="list-message">아직 올라온 글이 없습니다</p>';
      return;
    }

    listEl.innerHTML = `
      <section class="post-section">
        <h2 class="section-label">랜덤 글</h2>
        ${cardsHtml(sample(docs, RANDOM_COUNT), d => (d.categories.length ? pickOne(d.categories) : ''))}
      </section>`;
    fillPreviews(listEl, docs);
  } catch (err) {
    listEl.innerHTML = '<p class="list-message">글 목록을 불러오지 못했습니다</p>';
    console.error(err);
  }
}

main();
