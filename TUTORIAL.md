# FAR Clause Analyzer: Build and Deploy Tutorial

A walkthrough of what this tool does, how the pieces fit together, and how to
get it running for the Scripps contracting office. Written for someone who can
read TypeScript but hasn't seen this codebase before.

## What it does

A contracting officer drops a sponsor MSA PDF into the browser. The tool finds
every FAR, CAR, and DFARS reference in the document, looks each one up against
a bundled FAR corpus and an internal Green/Red/Grey guide, and streams back a
per-clause read: flag, rationale, SoW relevance, negotiation strategy, and
questions for the PI. The contracting officer's judgment governs every clause.
The tool surfaces information they would otherwise track down by hand.

It is not contract-review automation. It is a decision-support aid with
persistent disclaimers, source citations, and "model-sourced — verify" chips
wherever the answer came from the LLM rather than the bundled corpus.

## How it's built

### Stack

Next.js 15 App Router with TypeScript, Tailwind v4 for styling, `unpdf` for PDF
extraction (chosen because it works inside Vercel's serverless runtime), the
Anthropic SDK for LLM calls, Zod for response validation, and Vitest for tests.
No database, no telemetry, no analytics. PDFs are never persisted.

### The pipeline

The whole flow lives in `app/api/analyze/route.ts`. A multipart upload comes
in, gets read into bytes, and the route hands it off to a small set of focused
modules:

1. **Extract text.** `lib/extract/pdf.ts` wraps `unpdf` to pull plain text out
   of the PDF. If the document is image-only, it throws an error and the
   analyze route returns a 422 with a message telling the user to try a
   text-based PDF or paste the text. No OCR fallback by design: OCR errors
   propagate into the LLM analysis and the failure mode is worse than asking
   the user to retry with a real text PDF.
2. **Find clause references.** `lib/extract/clauses.ts` runs three regexes
   against the text, one for each authority. FAR matches `52.NNN-NN` with an
   optional `Alt I/II/...` designator, CAR matches `1352.NNN-NN`, DFARS matches
   `252.NNN-NNNN`. Results are deduped on `authority|section|alt` and sorted by
   occurrence.
3. **Find the Statement of Work.** `lib/extract/sow.ts` looks for a heading
   like "Statement of Work," "Scope of Work," "Description of Services,"
   "Performance Work Statement," or "Technical Description" and captures text
   up to the next ALL-CAPS heading or a ~6 KB cap. If the heuristic fails, the
   route falls back to `lib/llm/extract-sow.ts`, which asks the model to
   extract the SoW span verbatim from the first 12 KB of the document. If both
   fail, analysis still proceeds with an empty SoW; the per-clause prompt
   handles that case.
4. **Analyze each clause in parallel.** `lib/concurrency.ts` wraps `p-limit`
   with a default fan-out of 4. For each clause reference,
   `lib/llm/analyze-clause.ts` assembles a prompt with: the FAR corpus body
   for that clause (truncated to 6 KB head + 1 KB tail for long clauses), the
   prescribing subpart resolved from the "As prescribed in X.YY..." anchor,
   the Travis Guide entry verbatim if one exists, a 2 KB SoW excerpt, and an
   SIO institutional preamble describing the org context (non-profit research
   university, no classified work, fundamental-research norms under NSDD-189).
   The model returns JSON matching a Zod schema. Travis Guide flags override
   the model's flag when both are present, and every row carries `flag_source`
   and `source_confidence` so the UI can show provenance.
5. **Stream results back as NDJSON.** The route returns a `ReadableStream`
   that emits a `clauses_found` event with the count, then one `row` event
   per completed clause (order-insensitive, since they finish out of order
   under fan-out), then a `summary` event with green/red/grey/unknown counts.
   Per-call timeout is 30 seconds. Total route timeout is 300 seconds via
   `export const maxDuration = 300`.

### The corpus and the guide

`data/far_rag.jsonl` is the FAR corpus, FAC 2025-06. `lib/far-corpus.ts` loads
it once into a `Map<section, FarRecord>` plus a secondary `Map` of subpart
records, and exposes `getClause`, `getSubpart`, and `resolvePrescription`. The
prescription resolver parses the leading "As prescribed in X.YY..." anchor out
of a clause body, tries the direct section first, then falls back to the
enclosing subpart by trimming trailing digits. This is how each row gets a
"Prescribed at 4.19" link back to the regulatory source.

`data/travis-guide.json` is the internal Green/Red/Grey guide, seeded with
about 40 of the most common flow-downs encountered in SIO sponsor contracts.
`lib/travis-guide.ts` validates it with Zod and exposes `getGuideEntry`. The
schema supports per-section flag, guidance text, suggested justification for
removal, a question for the PI, alternate-specific notes, and free-form notes.
CI fails if a FAR entry in the guide references a section missing from the
corpus, so the guide cannot drift undetected from FAC updates
(`tests/guide-linkage.test.ts`).

### The UI

`app/page.tsx` is a single-page client component that manages five states:
idle, uploading, analyzing, done, and error. It reads the NDJSON stream
line-by-line, appending rows as they arrive. `components/ResultsTable.tsx`
sorts rows Red → Grey → Unknown → Green so high-attention items surface first.
`components/RowDetail.tsx` is the expand-on-click drawer with negotiation
strategy, PI questions, sources, local-only officer notes, and Mark Edited /
Reject buttons. Nothing in that drawer is sent back to the server; it's all
client state.

The visual system follows the seed style guide. Achromatic neutrals, two muted
accent palettes for flag semantics, no gratuitous color, every flag paired
with text and weight so it reads in grayscale (verified with Chrome's "emulate
achromatopsia"). Persistent disclaimer at the top of every page. Source chips
on every row.

## Responsible AI posture, made concrete

The seed principles aren't aspirational here, they're load-bearing. Concretely:

- **Transparency:** the AI involvement is visible in the header banner and in
  every row's source chips. The disclaimer "Decision-support aid. Contracting
  officer judgment governs" never scrolls off the page.
- **Accuracy and reliability:** Travis Guide flags override the model when
  present. Rows marked `source_confidence: "model"` get a "Model-sourced —
  verify" chip. The corpus is bundled, versioned (`fac_through` is in every
  record), and the guide-linkage test prevents typos.
- **Privacy:** no database, no logging of PDF contents, no telemetry. The PDF
  lives in memory for the duration of the request and is garbage-collected
  after.
- **Accountability:** every row exposes the corpus URL and the
  prescribing-subpart URL so the officer can verify against the source in one
  click.
- **Human agency:** Mark Edited / Reject / officer notes are client-only. The
  tool never claims authority it doesn't have.

## How to deploy it for Scripps

Vercel is the path of least resistance because the analyze route is already
configured for it. The corpus and guide ship inside the serverless bundle via
`outputFileTracingIncludes` in `next.config.ts`, so no external storage is
needed.

### Prerequisites

You need three things before deploying:

1. An Anthropic API key, billed to the right cost center. Decide whether this
   is on a UCSD billing relationship or a personal/pilot account; for
   production use by Scripps contracting, get it onto an institutional
   account.
2. A Vercel account (free tier works for pilot; team plan if multiple people
   will manage deployments).
3. Decision on access control. The codebase ships without authentication. For
   a tool that handles sponsor contract drafts, that's a non-starter for
   anything past a closed pilot. See the access-control section below.

### Local verification

Before deploying, run it locally to confirm everything works on your machine:

```bash
git clone <repo-url> far-analyzer
cd far-analyzer
pnpm install
cp .env.example .env.local
```

Edit `.env.local` to set `ANTHROPIC_MODEL=claude-opus-4-7` (or whichever model
you're standardizing on) and `ANTHROPIC_API_KEY=sk-ant-...`.

```bash
pnpm test    # confirms regex extraction, corpus loading, guide linkage
pnpm dev
```

Open `http://localhost:3000`, drop a sample MSA, watch rows stream in. If a
PDF returns "No extractable text," it's image-only; try a text-based PDF.

### Vercel deployment

From the project root, with the Vercel CLI installed:

```bash
vercel link        # connect this directory to a Vercel project
vercel env add ANTHROPIC_MODEL production
vercel env add ANTHROPIC_API_KEY production
vercel --prod
```

Or, more typically, push the repo to GitHub and connect it from the Vercel
dashboard: New Project → Import Git Repository → set the two environment
variables in Settings → Environment Variables → Deploy.

Once deployed, hit `https://your-deployment.vercel.app/api/healthz` to confirm
the Anthropic API is reachable. The endpoint returns `{ ok: true, env,
anthropic }` if the key works, or a sanitized error if it doesn't. It never
echoes the key itself.

### Settings to check on the Vercel project

- **Functions → Memory.** Default is fine for small MSAs. If you're regularly
  processing 50+ page contracts with many clauses, bump memory in the project
  dashboard.
- **Functions → Max Duration.** The analyze route exports `maxDuration = 300`,
  which gives you five minutes for a busy MSA with parallel clause fan-out.
  Vercel's Hobby tier caps at 60 seconds, so for production use you need Pro
  or higher.
- **Domain.** Assign a UCSD-friendly subdomain. Whether that's via UCSD DNS or
  a Vercel-hosted domain depends on what ITS will allow.

### Access control: this is the deployment-blocking question

The codebase has no authentication. A public URL means anyone can analyze
contracts against your Anthropic key, which is both a cost problem and a
posture problem. Three options, roughly in order of effort:

1. **Vercel Password Protection** (Pro plan feature). Single shared password
   gates the whole deployment. Acceptable for a small closed pilot with the
   SIO contracting team. Not acceptable as a steady state.
2. **UCSD SSO via a Vercel-compatible auth layer.** Auth0, Clerk, or NextAuth
   wired to UCSD's SAML/OIDC. NextAuth is the cheapest path technically and
   keeps everything in the existing codebase. This is the right answer for a
   real deployment.
3. **Host inside UCSD infrastructure.** If SIO has an internal app-hosting
   pattern that already integrates with single sign-on, the right move may be
   to deploy there rather than on Vercel. Worth a conversation with ITS
   before committing to Vercel as the platform.

I'd push for option 2 before broader rollout. Option 1 is fine for a pilot of
named individuals.

### Operational items before handoff to SIO contracting

- **Travis Guide ownership.** `data/travis-guide.json` is going to drift
  unless someone owns it. Decide who maintains it (presumably someone in SIO
  contracting) and how they propose changes. The schema is documented in the
  README, but a GitHub PR workflow assumes the maintainer is comfortable with
  git. If they're not, a simpler intake (Google Doc, email to a developer) is
  more honest.
- **FAR corpus updates.** The corpus is FAC 2025-06. FAC updates land roughly
  quarterly. Decide who watches for new FAC issuances and triggers a corpus
  rebuild via `data/build_far_rag.py`. The guide-linkage test will catch
  removed sections; new sections just won't have guide entries until someone
  adds them.
- **Cost monitoring.** Each clause is one Anthropic call. A typical MSA with
  30 clauses is 30 calls, plus one SoW extraction call if the heuristic
  missed. Set a billing alert on the Anthropic account. The system prompt is
  cache-eligible (`cache_control: { type: "ephemeral" }` is already set),
  which will save substantially once the cache warms.
- **Disclaimer language.** The current "Decision-support aid. Contracting
  officer judgment governs" is a deliberately plain statement. Before broader
  rollout, run it past whoever owns risk and compliance posture for SIO
  sponsored research. They may want specific language. The disclaimer
  component is `components/Disclaimer.tsx`, one-line change.
