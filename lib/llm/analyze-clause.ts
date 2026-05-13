import { z } from "zod";
import { getClause, resolvePrescription, type FarRecord } from "../far-corpus";
import { getGuideEntry, type GuideEntry } from "../travis-guide";
import {
  ClauseRow,
  LlmClauseResponse,
  type Authority,
  type Flag,
  type SourceLink,
} from "../schemas";
import { callLlm } from "./call";

const CLAUSE_HEAD = 6_000;
const CLAUSE_TAIL = 1_000;

const SIO_PREAMBLE = `Scripps Institution of Oceanography (SIO) is a non-profit
educational research institution within the University of California, San
Diego. Sponsor agreements are typically cost-reimbursement sponsored research
for fundamental research, with no publication restrictions by default. SIO
cannot host classified work, has no Government inspection system, and operates
under fundamental-research norms (NSDD-189). Contracting officer is reviewing
incoming sponsor terms and needs an actionable per-clause read.`;

const SYSTEM_PROMPT = `You are a contract-review assistant for a non-profit
research-university contracting office. For a single FAR/CAR/DFARS clause,
analyze its appropriateness for a Scripps sponsored-research agreement and
return STRICT JSON matching this schema:

{
  "flag": "green" | "red" | "grey" | "unknown",
  "rationale": string,           // 1-3 sentences. Cite the clause text or guide.
  "sow_relevance": string,       // 1-2 sentences relating the clause to the SoW.
  "negotiation_strategy": string,// concrete next move for the contracting officer.
  "pi_questions": string[]       // 0-3 short questions to ask the PI, if any.
}

Rules:
- If a Travis Guide entry is provided, prefer its flag and guidance verbatim.
- If no guide entry is provided, infer the flag from the clause body and SoW.
- Do NOT invent FAR section numbers, prescriptions, or URLs.
- Output JSON only, no prose, no code fences.`;

function truncate(text: string): {
  body: string;
  truncated: boolean;
} {
  if (text.length <= CLAUSE_HEAD + CLAUSE_TAIL) {
    return { body: text, truncated: false };
  }
  return {
    body: `${text.slice(0, CLAUSE_HEAD)}\n\n[...truncated...]\n\n${text.slice(-CLAUSE_TAIL)}`,
    truncated: true,
  };
}

function buildUserPrompt(args: {
  authority: Authority;
  section: string;
  alt: string | null;
  clause: FarRecord | null;
  prescription: ReturnType<typeof resolvePrescription>;
  guide: GuideEntry | null;
  sow: string;
}): string {
  const { authority, section, alt, clause, prescription, guide, sow } = args;
  const parts: string[] = [];
  parts.push(SIO_PREAMBLE);
  parts.push(
    `Clause under review: ${authority} ${section}${alt ? ` Alternate ${alt}` : ""}`,
  );

  if (clause) {
    const { body, truncated } = truncate(clause.text);
    parts.push(
      `--- CORPUS TEXT (${clause.title})${truncated ? " [truncated]" : ""} ---\n${body}`,
    );
  } else {
    parts.push(
      `--- CORPUS TEXT --- (not in FAR corpus; rely on general knowledge of ${authority})`,
    );
  }

  if (prescription) {
    parts.push(
      `--- PRESCRIBING SUBPART --- ${prescription.subpart} — ${prescription.text}`,
    );
  }

  if (guide) {
    const altGuidance = guide.alt_guidance
      ? `\nAlternate handling:\n${guide.alt_guidance.map((a) => `  ${a.alt}: ${a.note}`).join("\n")}`
      : "";
    const notes = guide.notes ? `\nNotes:\n  - ${guide.notes.join("\n  - ")}` : "";
    parts.push(
      `--- TRAVIS GUIDE ---
Flag: ${guide.flag.toUpperCase()}
Guidance: ${guide.guidance}${guide.suggested_justification ? `\nJustification (if removing): ${guide.suggested_justification}` : ""}${guide.question_for_pi ? `\nPI question: ${guide.question_for_pi}` : ""}${altGuidance}${notes}`,
    );
  } else {
    parts.push(
      `--- TRAVIS GUIDE --- (no entry; you must infer flag/handling and self-report low confidence)`,
    );
  }

  parts.push(`--- STATEMENT OF WORK EXCERPT ---\n${sow.slice(0, 2_000)}`);
  parts.push(
    `Return JSON only. Do not include any text before or after the JSON object.`,
  );

  return parts.join("\n\n");
}

/**
 * Convert an SDK / proxy error into a short, user-safe rationale string.
 * Strips out provider debug payloads that may include API key prefixes,
 * token hashes, or stack traces.
 */
function formatLlmError(err: unknown): string {
  const status =
    typeof err === "object" && err !== null && "status" in err
      ? (err as { status?: number }).status
      : undefined;
  if (status === 401 || status === 403) {
    return "Authentication failed against the LiteLLM proxy. Verify LITELLM_API_KEY in the Vercel project settings, then redeploy.";
  }
  if (status === 429) {
    return "Rate limited by the LiteLLM proxy. Try again in a moment.";
  }
  if (typeof status === "number" && status >= 500) {
    return `LiteLLM proxy returned ${status}; transient server-side error.`;
  }
  if (err instanceof Error && err.name === "AbortError") {
    return "LLM call timed out (30s).";
  }
  const msg = err instanceof Error ? err.message : String(err);
  // Take the first line and cap length so we never echo provider internals.
  const firstLine = msg.split(/\r?\n/, 1)[0];
  return `LLM call failed: ${firstLine.slice(0, 160)}`;
}

function tryParse(content: string): z.SafeParseReturnType<unknown, LlmClauseResponse> {
  // Strip code fences if the model wrapped the JSON despite the instruction.
  const stripped = content
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  try {
    return LlmClauseResponse.safeParse(JSON.parse(stripped));
  } catch {
    return {
      success: false,
      error: new z.ZodError([
        { code: "custom", path: [], message: "invalid JSON" },
      ]),
    } as z.SafeParseReturnType<unknown, LlmClauseResponse>;
  }
}

export type AnalyzeClauseInput = {
  authority: Authority;
  section: string;
  alt: string | null;
  sow: string;
};

export async function analyzeClause(
  input: AnalyzeClauseInput,
  signal?: AbortSignal,
): Promise<ClauseRow> {
  const clause = input.authority === "FAR" ? getClause(input.section) : null;
  const prescription =
    input.authority === "FAR" ? resolvePrescription(input.section) : null;
  const guide = getGuideEntry(input.section);

  const sourceConfidence: ClauseRow["source_confidence"] = clause
    ? "corpus"
    : "model";

  const sources: SourceLink[] = [];
  if (clause) {
    sources.push({ label: `${input.authority} ${input.section}`, url: clause.url });
  }
  if (prescription) {
    sources.push({
      label: `Prescribed at ${prescription.subpart}`,
      url: prescription.url,
    });
  }

  const fallback = (
    flag: Flag,
    rationale: string,
    extras?: Partial<LlmClauseResponse>,
  ): ClauseRow =>
    ClauseRow.parse({
      section: input.section,
      authority: input.authority,
      alt: input.alt,
      title: clause?.title ?? guide?.title ?? `${input.authority} ${input.section}`,
      flag,
      flag_source: guide ? "travis_guide" : "inferred",
      prescription: {
        subpart: prescription?.subpart ?? null,
        url: prescription?.url ?? null,
      },
      rationale,
      sow_relevance: extras?.sow_relevance ?? "",
      negotiation_strategy: extras?.negotiation_strategy ?? "",
      pi_questions: extras?.pi_questions ?? [],
      source_confidence: sourceConfidence,
      sources,
    });

  const userPrompt = buildUserPrompt({
    authority: input.authority,
    section: input.section,
    alt: input.alt,
    clause,
    prescription,
    guide,
    sow: input.sow,
  });

  const callOnce = async (extraSystem?: string) =>
    (
      await callLlm({
        system: extraSystem ? `${SYSTEM_PROMPT}\n\n${extraSystem}` : SYSTEM_PROMPT,
        user: userPrompt,
        maxTokens: 1_500,
        signal,
      })
    ).text;

  let raw: string;
  try {
    raw = await callOnce();
  } catch (err) {
    return fallback("unknown", formatLlmError(err));
  }

  let parsed = tryParse(raw);
  if (!parsed.success) {
    try {
      raw = await callOnce(
        "Your previous reply was not valid JSON. Return ONLY the JSON object — no commentary, no markdown.",
      );
      parsed = tryParse(raw);
    } catch (err) {
      return fallback("unknown", formatLlmError(err));
    }
  }

  if (!parsed.success) {
    return fallback(
      "unknown",
      `Could not parse model response as JSON. Raw: ${raw.slice(0, 280)}`,
    );
  }

  const llm = parsed.data;
  // Travis guide is the source of truth for flag when present.
  const finalFlag: Flag = guide ? guide.flag : llm.flag;
  return fallback(finalFlag, llm.rationale, llm);
}
