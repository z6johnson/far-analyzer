"""
Build a RAG corpus from the GSA FAR DITA XML source.

Source:  https://github.com/GSA/GSA-Acquisition-FAR  (DITA folder)
Output:  far_rag.jsonl, far_index.csv, far_parts.json

One JSONL record per FAR section. Each record has parsed metadata
(part, subpart, section number, title, type, effective date,
cross-references) plus the full plain-text body and the canonical
acquisition.gov URL.
"""

from __future__ import annotations

import csv
import json
import os
import re
import sys
from pathlib import Path
from xml.etree import ElementTree as ET

SRC_DIR = Path("/sessions/confident-modest-tesla/GSA-Acquisition-FAR/dita")
OUT_DIR = Path("/sessions/confident-modest-tesla/mnt/tools/far_clause_analyzer/rag")
OUT_DIR.mkdir(parents=True, exist_ok=True)

FAC_THROUGH = "FAC 2025-06 (effective Oct 1, 2025)"

# A section filename looks like: "1.101.dita", "52.204-21.dita",
# "1.102-2.dita", "52.000.dita". Parts/Subparts/Volumes have their
# own prefixed filenames and are TOC-only; we still emit structural
# records for them so the RAG can answer "what is in Part 15?".
SECTION_RE = re.compile(r"^(\d+)\.(\d+)(?:-(\d+))?\.dita$")
SUBPART_RE = re.compile(r"^Subpart_(\d+)\.(\d+)\.dita$")
PART_RE = re.compile(r"^Part_(\d+)\.dita$")

# Effective date lives in the title of a clause/provision as, e.g.,
# "(Nov 2021)" or "(May 2024)" or "(Deviation 2023-O0003) (Nov 2023)".
EFFECTIVE_RE = re.compile(
    r"\(([A-Z][a-z]{2,8}\s+\d{4})\)"
)

# Strip any DITA-specific whitespace
WS_RE = re.compile(r"[ \t]+")
ALL_WS_RE = re.compile(r"\s+")
NL_RE = re.compile(r"\n{3,}")


BLOCK_TAGS = {"p", "li", "title", "note", "example", "section"}


def text_of(elem: ET.Element) -> str:
    """Recursively extract text from an element. Produces readable prose
    by inserting newlines around block-level elements and collapsing the
    whitespace noise DITA leaves behind."""
    parts: list[str] = []

    def walk(e: ET.Element) -> None:
        tag = e.tag.split("}")[-1] if "}" in e.tag else e.tag
        is_block = tag in BLOCK_TAGS or tag == "ol" or tag == "ul"
        if is_block:
            parts.append("\n")
        if e.text:
            parts.append(e.text)
        for child in e:
            walk(child)
            if child.tail:
                parts.append(child.tail)
        if is_block:
            parts.append("\n")

    walk(elem)
    raw = "".join(parts)
    # Replace non-breaking spaces and stray control chars.
    raw = raw.replace("\u00a0", " ").replace("\u2013", "-").replace("\u2014", "-")
    # Join wrapped lines inside a paragraph (but preserve paragraph breaks).
    # First: collapse any run of horizontal whitespace.
    raw = WS_RE.sub(" ", raw)
    # Drop leading/trailing space on each line.
    raw = re.sub(r" *\n *", "\n", raw)
    # Merge single newlines that appear mid-sentence (e.g. "in\n24.302").
    # A single newline between two non-empty lines where the previous line
    # does NOT end in a terminator (. : ; ? ! or closing paren) collapses
    # to a space — this fixes the DITA line-break artifacts.
    def _unwrap(match: re.Match) -> str:
        before, after = match.group(1), match.group(2)
        if before and before[-1] in ".:;?!)]":
            return before + "\n" + after
        return before + " " + after
    raw = re.sub(r"([^\n]+)\n([^\n]+)", _unwrap, raw)
    # Re-run to catch chained wraps
    raw = re.sub(r"([^\n]+)\n([^\n]+)", _unwrap, raw)
    raw = NL_RE.sub("\n\n", raw)
    # Collapse accidental " ," / " ." introduced by unwrap
    raw = re.sub(r"\s+([,.;:])", r"\1", raw)
    return raw.strip()


def inline_text_of(elem: ET.Element) -> str:
    """Flat text of every descendant, spaces only (no block formatting).
    Useful for title and first-paragraph heuristics."""
    return " ".join(t for t in (s.strip() for s in elem.itertext()) if t)


def collect_xrefs(root: ET.Element) -> list[str]:
    refs: list[str] = []
    for xref in root.iter("xref"):
        href = xref.get("href") or ""
        txt = (xref.text or "").strip()
        # Prefer visible text (e.g., "4.1903" or "44 U.S.C. 3502")
        if txt:
            refs.append(txt)
        elif href:
            # Strip ".dita#FAR_..." to just the section number
            m = re.match(r"(\d+\.\d+(?:-\d+)?)\.dita", href)
            if m:
                refs.append(m.group(1))
    # Dedupe preserving order
    seen: set[str] = set()
    out: list[str] = []
    for r in refs:
        if r not in seen:
            seen.add(r)
            out.append(r)
    return out


def determine_type(root: ET.Element, section: str) -> str:
    """Return 'clause', 'provision', 'section', 'subpart', or 'part'."""
    body = root.find(".//conbody")
    if body is not None:
        oc = body.get("outputclass") or ""
        if "clause" in oc.lower():
            return "clause"
        if "provision" in oc.lower():
            return "provision"
    # Fallback: Part 52 sections without an outputclass marker.
    # The opening paragraph always reads:
    #   "As prescribed in X.YYY, insert the following clause|provision:"
    if section and section.startswith("52.") and body is not None:
        first_p = body.find("p")
        first = inline_text_of(first_p).lower() if first_p is not None else ""
        if "following provision" in first:
            return "provision"
        if "following clause" in first:
            return "clause"
        # A handful of Part 52 sections are prescriptive scope paragraphs
        # (52.000, 52.100, 52.200, etc.) — leave those as "section".
    return "section"


def canonical_url(section: str) -> str:
    return f"https://www.acquisition.gov/far/{section}"


def parse_section_file(path: Path) -> dict | None:
    m = SECTION_RE.match(path.name)
    if not m:
        return None
    part, sec_a, sec_b = m.group(1), m.group(2), m.group(3)
    section = f"{part}.{sec_a}" + (f"-{sec_b}" if sec_b else "")
    subpart = f"{part}.{sec_a[0]}" if sec_a and sec_a != "000" else part

    try:
        # Some files reference a DTD. Parse with a forgiving loader.
        tree = ET.parse(path)
    except ET.ParseError as exc:
        print(f"skip {path.name}: parse error {exc}", file=sys.stderr)
        return None
    root = tree.getroot()

    concept = root.find(".//concept") or root.find(".//topic")
    if concept is None:
        return None

    title_el = concept.find("title")
    if title_el is None:
        return None
    title_full = inline_text_of(title_el)
    # The title begins with the section number. Strip it.
    title = re.sub(rf"^{re.escape(section)}\s*", "", title_full).strip(" .")
    title = ALL_WS_RE.sub(" ", title).strip()

    body = concept.find("conbody") or concept.find("body")
    body_text = text_of(body) if body is not None else ""

    eff = None
    eff_m = EFFECTIVE_RE.search(title_full + " " + body_text[:200])
    if eff_m:
        eff = eff_m.group(1)

    return {
        "id": concept.get("id", f"FAR_{section.replace('.', '_').replace('-', '_')}"),
        "section": section,
        "part": part,
        "subpart": subpart,
        "title": title,
        "type": determine_type(concept, section),
        "effective_date": eff,
        "text": body_text,
        "cross_references": collect_xrefs(concept),
        "url": canonical_url(section),
        "source_file": path.name,
        "fac_through": FAC_THROUGH,
    }


def parse_subpart_file(path: Path) -> dict | None:
    m = SUBPART_RE.match(path.name)
    if not m:
        return None
    part, sp = m.group(1), m.group(2)
    section = f"Subpart {part}.{sp}"
    try:
        tree = ET.parse(path)
    except ET.ParseError:
        return None
    root = tree.getroot()
    topic = root.find(".//topic") or root.find(".//concept")
    if topic is None:
        return None
    title_el = topic.find("title")
    title_full = inline_text_of(title_el) if title_el is not None else section
    title = re.sub(rf"^Subpart\s+{part}\.{sp}\s*[-–—]*\s*", "", title_full).strip()
    title = ALL_WS_RE.sub(" ", title).strip()
    return {
        "id": topic.get("id", f"FAR_Subpart_{part}_{sp}"),
        "section": f"{part}.{sp}",
        "part": part,
        "subpart": f"{part}.{sp}",
        "title": title,
        "type": "subpart",
        "effective_date": None,
        "text": title_full,
        "cross_references": [],
        "url": f"https://www.acquisition.gov/far/subpart-{part}.{sp}",
        "source_file": path.name,
        "fac_through": FAC_THROUGH,
    }


def parse_part_file(path: Path) -> dict | None:
    m = PART_RE.match(path.name)
    if not m:
        return None
    part = m.group(1)
    try:
        tree = ET.parse(path)
    except ET.ParseError:
        return None
    root = tree.getroot()
    topic = root.find(".//topic")
    if topic is None:
        return None
    title_el = topic.find("title")
    title_full = inline_text_of(title_el) if title_el is not None else f"Part {part}"
    title = re.sub(rf"^Part\s+{part}\s*[-–—]*\s*", "", title_full).strip()
    title = ALL_WS_RE.sub(" ", title).strip()
    # TOC: the body is a nested <ul> of <xref>s. We flatten the xref text.
    body = topic.find("body")
    toc_lines: list[str] = []
    if body is not None:
        for xref in body.iter("xref"):
            t = (xref.text or "").strip()
            if t:
                toc_lines.append(t)
    return {
        "id": topic.get("id", f"FAR_Part_{part}"),
        "section": f"Part {part}",
        "part": part,
        "subpart": None,
        "title": title,
        "type": "part",
        "effective_date": None,
        "text": title_full + "\n\nContents:\n" + "\n".join(toc_lines),
        "cross_references": [],
        "url": f"https://www.acquisition.gov/far/part-{part}",
        "source_file": path.name,
        "fac_through": FAC_THROUGH,
    }


def main() -> None:
    records: list[dict] = []
    sec_files = sorted(SRC_DIR.glob("*.dita"))
    for path in sec_files:
        name = path.name
        rec = None
        if SECTION_RE.match(name):
            rec = parse_section_file(path)
        elif SUBPART_RE.match(name):
            rec = parse_subpart_file(path)
        elif PART_RE.match(name):
            rec = parse_part_file(path)
        if rec:
            records.append(rec)

    # Natural sort: part, subpart, section number, sub-paragraph
    def sort_key(r: dict):
        try:
            p = int(r["part"])
        except (ValueError, TypeError):
            p = 9999
        sec = r["section"].replace("Part ", "").replace("Subpart ", "")
        m = re.match(r"(\d+)\.(\d+)(?:-(\d+))?", sec)
        if m:
            a = int(m.group(1))
            b = int(m.group(2))
            c = int(m.group(3) or 0)
        else:
            a = p
            b = 0
            c = 0
        type_rank = {"part": 0, "subpart": 1}.get(r["type"], 2)
        return (p, type_rank, a, b, c)

    records.sort(key=sort_key)

    # Write JSONL — the RAG corpus. Include every record that carries
    # body text plus all structural records (part/subpart). Skip bare
    # parent-section container records (e.g. 3.101 where only the
    # children 3.101-1, 3.101-2 hold real text) so retrieval doesn't
    # surface empty hits.
    jsonl_path = OUT_DIR / "far_rag.jsonl"
    skipped_empty = 0
    with jsonl_path.open("w", encoding="utf-8") as f:
        for r in records:
            if r["type"] in ("clause", "provision", "section") and len(r["text"]) < 20:
                skipped_empty += 1
                continue
            f.write(json.dumps(r, ensure_ascii=False) + "\n")

    # Write CSV index (no body text, for quick lookup)
    csv_path = OUT_DIR / "far_index.csv"
    with csv_path.open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow([
            "section", "type", "part", "subpart", "title",
            "effective_date", "url", "char_count",
        ])
        for r in records:
            w.writerow([
                r["section"], r["type"], r["part"], r["subpart"] or "",
                r["title"], r["effective_date"] or "",
                r["url"], len(r["text"]),
            ])

    # Parts summary
    parts: dict[str, dict] = {}
    for r in records:
        p = r["part"]
        if p not in parts:
            parts[p] = {"part": p, "title": "", "sections": 0, "clauses": 0, "provisions": 0}
        if r["type"] == "part":
            parts[p]["title"] = r["title"]
        elif r["type"] == "clause":
            parts[p]["clauses"] += 1
            parts[p]["sections"] += 1
        elif r["type"] == "provision":
            parts[p]["provisions"] += 1
            parts[p]["sections"] += 1
        elif r["type"] == "section":
            parts[p]["sections"] += 1
    parts_path = OUT_DIR / "far_parts.json"
    with parts_path.open("w", encoding="utf-8") as f:
        json.dump(sorted(parts.values(), key=lambda x: int(x["part"]) if x["part"].isdigit() else 999), f, indent=2)

    # Summary
    total = len(records)
    by_type: dict[str, int] = {}
    for r in records:
        by_type[r["type"]] = by_type.get(r["type"], 0) + 1
    print(f"wrote {total - skipped_empty} records to {jsonl_path}")
    print(f"    (skipped {skipped_empty} empty parent-section containers — they remain in far_index.csv)")
    print(f"by type: {by_type}")
    print(f"bytes: jsonl={jsonl_path.stat().st_size:,}  csv={csv_path.stat().st_size:,}")


if __name__ == "__main__":
    main()
