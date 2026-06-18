from __future__ import annotations

import html
import json
import re
import sys
from datetime import date
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
IMPORTS = ROOT / "story-imports"
STORIES = ROOT / "stories"
DATA_FILE = ROOT / "stories-data.js"


def clean_fragment(fragment: str) -> str:
    text = re.sub(r"<[^>]+>", " ", fragment)
    text = html.unescape(text).replace("\xa0", " ")
    text = re.sub(r"\s+", " ", text).strip()
    return text.replace(" .", ".")


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug or "story"


def title_from_file(path: Path) -> str:
    title = re.sub(r"[-_]+", " ", path.stem).strip()
    title = re.sub(r"\s+", " ", title)
    return title.title() if title else "Untitled Story"


def read_text(path: Path) -> str:
    raw = path.read_bytes()
    for encoding in ("utf-8-sig", "utf-8", "cp1252", "latin1"):
        try:
            return raw.decode(encoding)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", errors="replace")


def extract_chapters(source: str) -> list[dict]:
    headings = list(re.finditer(r"<h3[^>]*>.*?</h3>", source, flags=re.S | re.I))
    if not headings:
        headings = list(re.finditer(r"<h[12][^>]*>.*?</h[12]>", source, flags=re.S | re.I))

    chapters: list[dict] = []
    for index, match in enumerate(headings):
        title = clean_fragment(match.group(0)).replace("Kapital", "Kapitel")
        start = match.end()
        end = headings[index + 1].start() if index + 1 < len(headings) else len(source)
        block = source[start:end]
        passages = extract_rows(block)
        if passages:
            chapters.append({"title": title or f"Chapter {index + 1}", "passages": passages})

    if chapters:
        return chapters

    passages = extract_rows(source)
    return [{"title": "Chapter 1", "passages": passages}] if passages else []


def extract_rows(source: str) -> list[dict]:
    passages: list[dict] = []
    rows = re.findall(r"<tr[^>]*>(.*?)</tr>", source, flags=re.S | re.I)
    for row in rows:
        cells = re.findall(r"<td[^>]*>(.*?)</td>", row, flags=re.S | re.I)
        if len(cells) >= 2:
            left = clean_fragment(cells[0])
            right = clean_fragment(cells[1])
            if left and right:
                passages.append({"da": left, "en": right})
    return passages


def story_from_html(path: Path) -> dict:
    source = read_text(path)
    title = title_from_file(path)
    chapters = extract_chapters(source)
    if not chapters:
        raise ValueError(f"No bilingual table rows found in {path.name}")

    first_passage = chapters[0]["passages"][0]
    summary = first_passage["en"] or first_passage["da"]
    if len(summary) > 190:
        summary = summary[:187].rstrip() + "..."

    return {
        "id": slugify(path.stem),
        "title": title,
        "subtitle": "A parallel bilingual story",
        "languages": {"left": "Dansk", "right": "English"},
        "summary": summary,
        "tags": ["parallel text", "Danish", "English"],
        "updated": date.today().isoformat(),
        "chapters": chapters,
    }


def unique_ids(stories: list[dict]) -> None:
    seen: dict[str, int] = {}
    for story in stories:
        base = story["id"]
        seen[base] = seen.get(base, 0) + 1
        if seen[base] > 1:
            story["id"] = f"{base}-{seen[base]}"


def write_outputs(stories: list[dict]) -> None:
    STORIES.mkdir(exist_ok=True)
    for story in stories:
        (STORIES / f"{story['id']}.json").write_text(
            json.dumps(story, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    index = {
        "stories": [
            {
                "id": story["id"],
                "title": story["title"],
                "subtitle": story["subtitle"],
                "summary": story["summary"],
                "tags": story["tags"],
                "file": f"{story['id']}.json",
            }
            for story in stories
        ]
    }
    (STORIES / "index.json").write_text(json.dumps(index, ensure_ascii=False, indent=2), encoding="utf-8")
    DATA_FILE.write_text(
        "window.STORY_LIBRARY = " + json.dumps({"stories": stories}, ensure_ascii=False, indent=2) + ";\n",
        encoding="utf-8",
    )


def main() -> int:
    IMPORTS.mkdir(exist_ok=True)
    html_files = sorted([*IMPORTS.glob("*.htm"), *IMPORTS.glob("*.html")])
    if not html_files:
        print(f"No .htm or .html files found in: {IMPORTS}")
        print("Drop exported story files there, then run this updater again.")
        return 1

    stories = []
    for path in html_files:
        story = story_from_html(path)
        stories.append(story)
        passage_count = sum(len(chapter["passages"]) for chapter in story["chapters"])
        print(f"Imported {path.name}: {len(story['chapters'])} chapters, {passage_count} passages")

    unique_ids(stories)
    write_outputs(stories)
    print(f"\nUpdated library with {len(stories)} story/stories.")
    print(f"Open: {ROOT / 'index.html'}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"Could not update the library: {exc}", file=sys.stderr)
        raise SystemExit(1)
