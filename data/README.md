# FAR RAG Corpus

A machine-readable corpus of the Federal Acquisition Regulation, ready to ingest into a vector store for retrieval-augmented generation over FAR content. Built from the GSA's official DITA-XML source rather than scraped HTML, so every clause, provision, and section is captured once and completely.

## What's here

- `far_rag.jsonl` — one JSON object per FAR record that carries body text (3,484 records, ~7.7 MB). Primary corpus.
- `far_index.csv` — metadata-only index for every record including the 384 empty parent-section containers (3,868 rows). Useful when you want the complete hierarchy, not just the retrievable chunks.
- `far_parts.json` — part-level summary: title plus counts of sections, clauses, and provisions per part.
- `build_far_rag.py` — the build script. Re-run it against a fresh clone of the source repo to regenerate everything.

## Source and version

- Upstream: [github.com/GSA/GSA-Acquisition-FAR](https://github.com/GSA/GSA-Acquisition-FAR), the DITA XML publication GSA maintains for the FAR.
- Version captured: **FAC 2025-06, effective October 1, 2025.**
- Canonical reading URLs point back to `https://www.acquisition.gov/far/{section}` so each record can cite itself.

## Record schema

Each line in `far_rag.jsonl` is a JSON object with:

| Field | Description |
| --- | --- |
| `id` | DITA concept id (e.g. `FAR_52_204_21`). |
| `section` | Canonical section number (e.g. `52.204-21`, or `Part 15` / `Subpart 52.2` for structural records). |
| `part` | FAR Part number as a string, 1–53. |
| `subpart` | Subpart id (e.g. `52.2`) where available. |
| `title` | Section title with whitespace normalized. |
| `type` | One of `part`, `subpart`, `section`, `clause`, `provision`. Clauses and provisions are Part 52 entries that carry prescription language. |
| `effective_date` | Month-year shown in the clause title (e.g. `Nov 2021`). Null for non-Part-52 records. |
| `text` | Full plain-text body, paragraph breaks preserved, DITA line-wrap artifacts removed. |
| `cross_references` | Ordered, deduplicated list of other sections and U.S.C. citations referenced in the body. |
| `url` | Canonical acquisition.gov URL for the section. |
| `source_file` | Filename in the upstream `dita/` directory. |
| `fac_through` | The FAC version the corpus captures. |

## Counts

- 53 Parts
- 319 Subparts
- 2,890 regulatory sections (Parts 1–51 plus 53) — 384 of these are empty parent containers whose text lives in their sub-paragraph children; they appear in the index but are excluded from the RAG corpus
- 489 Part 52 clauses
- 117 Part 52 provisions

Corpus (with body text): **3,484 records.** Index (full hierarchy): **3,868 rows.**

## Using the corpus

For retrieval, embed the `text` field (chunked if your model has a tight context window — most Part 52 clauses fit comfortably as a single chunk; a handful of long sections, notably 52.212-4 and sections in Part 15 and Part 31, will want ~1,000-token chunks with overlap).

Keep the full record as metadata alongside each chunk so the model can cite the section number, title, effective date, and URL when it answers.

Structural records (`type` in `part`, `subpart`) are useful for scope questions ("what's in Part 15?") but should typically be excluded from similarity search against user clause questions — they dilute relevance.

## Regenerating

```
git clone --depth 1 https://github.com/GSA/GSA-Acquisition-FAR.git /tmp/gsa-far
python3 build_far_rag.py --src /tmp/gsa-far/dita --out .
```

`--src` points at the upstream `dita/` directory; `--out` is where `far_rag.jsonl`, `far_index.csv`, and `far_parts.json` are written. Both can also be set via the `FAR_SRC_DIR` and `FAR_OUT_DIR` environment variables.

`--fac-through` stamps a FAC label on every record. When omitted, the script scrapes the label from `Version.dita` / `README.md` / `FARTOC.dita` in the source tree and falls back to the last-known release if nothing plausible is found. Run time is under a minute on a laptop.

Regeneration also happens automatically on a weekly schedule via `.github/workflows/update-far-corpus.yml`, which opens a draft PR whenever the upstream DITA source changes. See the top-level `README.md` for the full pipeline.

## Known limitations

- DITA fill-in metadata (the `xtrc` attributes that identify who supplies a value in a clause fill-in) is not yet parsed into a separate field. The visible fill-in text is preserved in the body, but if you need structured fill-in types per clause, extend `parse_section_file` to read `xtrc` attributes off `ph` elements.
- Cross-reference extraction captures the visible text of `<xref>` elements. Most link to other FAR sections; a minority point at U.S.C. or CFR citations. No attempt is made to normalize external citations.
- Alternates (e.g. 52.227-14 Alternate I, Alternate II) appear as separate files in the upstream DITA and are preserved as separate records.
