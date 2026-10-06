#!/usr/bin/env python3
"""indexes/*.json 을 읽어서 c/, t/, w/ 아래에 폴더와 index.html 을 자동 생성한다.

사용법 (wiki/ 폴더 안에서):
    python build_pages.py             # 없는 페이지만 새로 만든다 (기존 파일은 건드리지 않음)
    python build_pages.py --update    # 제목이 바뀐 기존 페이지도 다시 쓴다
                                      # (c/ t/ 에 '분류:' '틀:' 접두어가 붙은 뒤 처음 한 번은 이걸로 갱신)
    python build_pages.py --dry-run   # 실제로 쓰지 않고 무엇을 할지만 보여준다

인덱스 -> 출력 폴더
    indexes/category.json -> c/<slug>/index.html   (분류 목록 페이지)
    indexes/templete.json -> t/<slug>/index.html   (틀 페이지)
    indexes/article.json  -> w/<slug>/index.html   (문서 페이지)
"""

import argparse
import json
import re
import sys
from html import escape
from pathlib import Path

ROOT = Path(__file__).resolve().parent  # 이 파일이 있는 폴더 = wiki/

SITE_DESCRIPTION = "다코의 가상세계 위키"

# 분류(c/) 페이지 템플릿: 목록형 페이지
CATEGORY_HTML = """<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{title}</title>
  <meta property="og:title" content="{title}">
  <meta property="og:description" content="{description}">
  <meta property="og:type" content="website">
  <link rel="icon" href="/icon.svg">
  <link rel="stylesheet" href="/styles/home.css">
  <script type="module" src="/scripts/layout.js"></script>
  <script type="module" src="/scripts/category.js"></script>
</head>
<body>
  <div class="container">
    <main id="post-list" class="post-list"></main>
  </div>
</body>
</html>
"""

# 문서(w/)·틀(t/) 페이지 템플릿: 본문형 페이지
ARTICLE_HTML = """<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{title}</title>
  <meta property="og:title" content="{title}">
  <meta property="og:description" content="{description}">
  <meta property="og:type" content="article">
  <link rel="icon" href="/icon.svg">
  <link rel="stylesheet" href="/styles/article.css">
  <script type="module" src="/scripts/layout.js"></script>
  <script type="module" src="/scripts/article.js"></script>
</head>
<body>
  <div class="container">
    <article id="content"></article>
  </div>
</body>
</html>
"""

# (인덱스 파일, 출력 폴더, 템플릿, 제목 접두어)
# 접두어는 <title>, og:title 에 붙는다 (예: 분류:인물, 틀:삼록권 6경)
TARGETS = [
    ("category.json", "c", CATEGORY_HTML, "분류:"),
    ("templete.json", "t", ARTICLE_HTML, "틀:"),
    ("article.json", "w", ARTICLE_HTML, ""),
]

# 폴더 이름으로 쓸 수 있는 slug: 경로 구분자나 .. 같은 건 거부
SAFE_SLUG = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_\-.]*$")


def load_index(path: Path) -> dict:
    # utf-8-sig: BOM이 붙어 있어도 읽힘
    with path.open(encoding="utf-8-sig") as f:
        data = json.load(f)
    if not isinstance(data, dict):
        raise ValueError(f"{path.name}: 최상위가 객체({{}})여야 합니다")
    return data


def render(template: str, title: str, prefix: str = "") -> str:
    return template.format(title=escape(prefix + title, quote=True), description=escape(SITE_DESCRIPTION, quote=True))


def write_page(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    # 기존 파일들이 CRLF라서 맞춰 준다 (OS와 상관없이 동일하게 저장)
    with path.open("w", encoding="utf-8", newline="\r\n") as f:
        f.write(content)


def read_existing(path: Path) -> str:
    # 줄바꿈 차이는 무시하고 비교하려고 universal newline으로 읽는다
    with path.open(encoding="utf-8", newline=None) as f:
        return f.read()


def main() -> int:
    parser = argparse.ArgumentParser(description="indexes/*.json 으로 c/ t/ w/ 페이지 생성")
    parser.add_argument("--update", action="store_true", help="내용이 달라진 기존 페이지도 덮어쓴다")
    parser.add_argument("--dry-run", action="store_true", help="파일을 쓰지 않고 결과만 출력한다")
    args = parser.parse_args()

    indexes_dir = ROOT / "indexes"
    if not indexes_dir.is_dir():
        print(f"[오류] indexes 폴더를 찾을 수 없어: {indexes_dir}\n       이 스크립트를 wiki/ 폴더 안에 두고 실행해줘.")
        return 1

    created = updated = same = skipped = 0
    problems = 0

    for index_name, out_dir, template, prefix in TARGETS:
        index_path = indexes_dir / index_name
        if not index_path.is_file():
            print(f"[경고] {index_name} 없음 -> {out_dir}/ 건너뜀")
            continue

        try:
            entries = load_index(index_path)
        except (json.JSONDecodeError, ValueError) as e:
            print(f"[오류] {index_name} 읽기 실패: {e}")
            problems += 1
            continue

        print(f"\n== {index_name} -> {out_dir}/ ({len(entries)}개)")

        for slug, info in entries.items():
            if not SAFE_SLUG.match(slug):
                print(f"  [건너뜀] 폴더 이름으로 쓸 수 없는 slug: {slug!r}")
                problems += 1
                continue
            title = info.get("title") if isinstance(info, dict) else None
            if not isinstance(title, str) or not title.strip():
                print(f"  [건너뜀] {slug}: title이 없음")
                problems += 1
                continue

            page = ROOT / out_dir / slug / "index.html"
            content = render(template, title, prefix)

            if not page.exists():
                if not args.dry_run:
                    write_page(page, content)
                print(f"  [생성] {out_dir}/{slug}/index.html  ({prefix}{title})")
                created += 1
            elif read_existing(page) == content:
                same += 1
            elif args.update:
                if not args.dry_run:
                    write_page(page, content)
                print(f"  [갱신] {out_dir}/{slug}/index.html  ({prefix}{title})")
                updated += 1
            else:
                print(f"  [다름] {out_dir}/{slug}/index.html 은 내용이 달라 (--update 로 덮어쓸 수 있어)")
                skipped += 1

        # 인덱스에 없는데 폴더만 남아 있는 것 알려주기 (삭제는 하지 않음)
        out_path = ROOT / out_dir
        if out_path.is_dir():
            orphans = sorted(p.name for p in out_path.iterdir() if p.is_dir() and p.name not in entries)
            for name in orphans:
                print(f"  [참고] {out_dir}/{name}/ 은 {index_name}에 없어 (삭제는 안 해)")

    label = "(dry-run) " if args.dry_run else ""
    print(f"\n{label}완료: 생성 {created}, 갱신 {updated}, 변경 없음 {same}, 내용 다름 {skipped}, 문제 {problems}")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
