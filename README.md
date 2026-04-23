# FAR Clause Analyzer

A decision-support tool for the Scripps Institution of Oceanography (UC San
Diego) contracting office. Drop a sponsor MSA PDF, get a per-clause read of
every FAR / CAR / DFARS reference: flag (Green / Red / Grey), prescription,
rationale, SoW relevance, negotiation strategy, and PI questions — grounded
in the bundled FAR corpus and an internal guide where possible, with
explicit "model-sourced" chips when the LLM is filling gaps (CAR, DFARS,
unknown FAR sections).

This is **not** a contract-review automation. It is an aid. A contracting
officer's judgment governs every clause it surfaces.

## Stack

- Next.js 15 App Router · TypeScript · Tailwind v4
- `unpdf` for PDF text extraction (Vercel-serverless safe)
- `openai` SDK pointed at a LiteLLM proxy
- `zod` for response validation
- `vitest` for unit + integration tests

## Run locally

```bash
pnpm install
cp .env.example .env.local   # then fill in the three vars below
pnpm dev
```

Open http://localhost:3000 and drop a contract PDF.

### Required environment variables

| Var | Purpose |
| --- | --- |
| `LITELLM_API_KEY` | Auth for the LiteLLM proxy. |
| `LITELLM_BASE_URL` | LiteLLM proxy URL (`https://…/v1`). |
| `ANTHROPIC_MODEL` | Model id to send (e.g. `claude-opus-4-7`). |

The analyze route refuses to start a request without all three set and
returns a clear 500 rather than a stack trace.

## Tests

```bash
pnpm test
```

Suite covers:
- FAR / CAR / DFARS regex extraction (incl. Alternates and parenthesized variants)
- FAR corpus loader and prescription resolution
- Travis Guide JSON ↔ FAR corpus linkage (every FAR entry must resolve)
- SoW heading heuristic

## Repo layout

```
app/
  layout.tsx, page.tsx, globals.css
  api/analyze/route.ts          # POST → NDJSON stream of per-clause rows
components/
  Header, Disclaimer, Dropzone, ResultsTable, RowDetail, FlagBadge
lib/
  schemas.ts                    # Zod types: ClauseRow, AnalyzeEvent
  far-corpus.ts                 # JSONL loader + getClause / resolvePrescription
  travis-guide.ts               # typed accessor over data/travis-guide.json
  concurrency.ts                # p-limit wrapper (default 4)
  extract/{pdf,clauses,sow}.ts  # raw text → ClauseRefs + SoW excerpt
  llm/{client,extract-sow,analyze-clause}.ts
data/
  far_rag.jsonl                 # FAR corpus (FAC 2025-06)
  travis-guide.json             # internal Green/Red/Grey guide
  build_far_rag.py              # corpus regeneration script
tests/
  *.test.ts
```

## How it works

1. `POST /api/analyze` receives a multipart upload (PDF or TXT, ≤ 10 MB).
2. `unpdf` pulls plain text. If the PDF is image-only, the route returns
   422 with an actionable message.
3. `extractClauseRefs` regexes FAR / CAR / DFARS references out of the text,
   preserving Alternates.
4. `extractSow` looks for a heading-anchored Statement of Work; if it can't
   find one, the LLM is asked to extract the SoW span verbatim.
5. For each clause ref, we fan out (cap 4) per-clause LLM calls. Each call
   is given:
   - the FAR corpus body for that clause (truncated to 6 KB head + 1 KB tail
     for very long clauses),
   - the prescribing subpart (when resolvable from the leading "As prescribed
     in X.YY..." anchor),
   - the Travis Guide entry verbatim (when present),
   - a 2 KB SoW excerpt,
   - the SIO institutional preamble.
6. Results stream back as NDJSON events:
   - `clauses_found` first,
   - one `row` per completed analysis (order-insensitive),
   - one `summary` with green/red/grey/unknown counts at the end.
7. The browser renders rows as they arrive. Travis Guide flags override the
   model's flag when both are present; the row carries `flag_source`
   ("travis_guide" | "inferred") and `source_confidence` ("corpus" | "model")
   so the UI can show the user where each cell came from.

## Authoring the Travis Guide

`data/travis-guide.json` ships with a seed of ~40 of the most common
FAR / CAR / DFARS flow-downs encountered in SIO sponsor contracts. To extend
it, add entries matching the schema in `lib/travis-guide.ts`:

```ts
type GuideEntry = {
  section: string;                // "52.204-21"
  authority: "FAR" | "CAR" | "DFARS";
  flag: "green" | "red" | "grey";
  title?: string;
  guidance: string;               // verbatim from the source guide
  suggested_justification?: string;
  question_for_pi?: string;
  alt_guidance?: { alt: string; note: string }[];
  notes?: string[];
};
```

`tests/guide-linkage.test.ts` will fail in CI if a FAR entry references a
section that doesn't exist in the corpus (typo or removed clause), so the
guide can't drift undetected from the corpus.

## Deploy (Vercel)

- `maxDuration = 300` is exported from the analyze route segment — per-clause
  LLM fan-out plus a 30 s per-call timeout means a busy MSA can take a couple
  of minutes. (Vercel's `vercel.json` `functions` block doesn't accept App
  Router paths; rely on the segment export instead.)
- If you need more than the default function memory, raise it in the Vercel
  project dashboard → Settings → Functions.
- `next.config.ts` uses `outputFileTracingIncludes` to ensure
  `data/far_rag.jsonl` and `data/travis-guide.json` ship inside the
  serverless bundle.
- Set `LITELLM_API_KEY`, `LITELLM_BASE_URL`, `ANTHROPIC_MODEL` in the
  Vercel project's environment variables. Do not commit them.
- No telemetry, no analytics, no database. PDFs are never persisted.

## Responsible AI posture

- Persistent on-screen disclaimer: "Decision-support aid. Contracting
  officer judgment governs."
- Every row carries source chips: corpus link, prescribing-subpart link,
  Travis Guide tag, and a "model-sourced — verify" chip whenever the
  authority isn't FAR (i.e. the clause body wasn't grounded in the bundled
  corpus).
- Rows are sorted Red → Grey → Unknown → Green so high-attention items
  surface first.
- The detail panel exposes officer-only Mark Edited / Reject / local notes
  controls; nothing in that panel is sent back to the server.
- Color is paired with text labels and weight on every flag so the UI is
  legible in grayscale (verified with Chrome's "emulate achromatopsia").
