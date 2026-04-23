import { z } from "zod";

export const Authority = z.enum(["FAR", "CAR", "DFARS"]);
export type Authority = z.infer<typeof Authority>;

export const Flag = z.enum(["green", "red", "grey", "unknown"]);
export type Flag = z.infer<typeof Flag>;

export const SourceLink = z.object({
  label: z.string(),
  url: z.string().url(),
});
export type SourceLink = z.infer<typeof SourceLink>;

export const ClauseRow = z.object({
  section: z.string(),
  authority: Authority,
  alt: z.string().nullable(),
  title: z.string(),
  flag: Flag,
  flag_source: z.enum(["travis_guide", "inferred"]),
  prescription: z.object({
    subpart: z.string().nullable(),
    url: z.string().url().nullable(),
  }),
  rationale: z.string(),
  sow_relevance: z.string(),
  negotiation_strategy: z.string(),
  pi_questions: z.array(z.string()),
  source_confidence: z.enum(["corpus", "model"]),
  sources: z.array(SourceLink),
});
export type ClauseRow = z.infer<typeof ClauseRow>;

/**
 * Subset of ClauseRow that the LLM is expected to produce. Deterministic
 * fields (section, authority, alt, title, prescription, flag_source from
 * travis_guide, source_confidence) are merged in server-side.
 */
export const LlmClauseResponse = z.object({
  flag: Flag,
  rationale: z.string(),
  sow_relevance: z.string(),
  negotiation_strategy: z.string(),
  pi_questions: z.array(z.string()).default([]),
});
export type LlmClauseResponse = z.infer<typeof LlmClauseResponse>;

export type AnalyzeEvent =
  | { type: "clauses_found"; count: number; sow_excerpt_chars: number }
  | { type: "row"; row: ClauseRow }
  | {
      type: "summary";
      counts: { green: number; red: number; grey: number; unknown: number };
    }
  | { type: "error"; message: string };
