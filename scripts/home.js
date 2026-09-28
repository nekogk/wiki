import { loadDocs, loadJson, cardsHtml, fillPreviews, pickOne, CATEGORY_INDEX } from '/scripts/common.js';

const RANDOM_COUNT = 1024;
const listEl = document.getElementById('post-list');

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
    const [docs, cats] = await Promise.all([loadDocs(), loadJson(CATEGORY_INDEX)]);
    if (!docs.length) {
      listEl.innerHTML = '<p class="list-message">아직 올라온 글이 없습니다</p>';
      return;
    }

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
