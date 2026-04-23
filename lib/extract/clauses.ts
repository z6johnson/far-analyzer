import type { Authority } from "../schemas";

export type ClauseRef = {
  authority: Authority;
  /** Canonical section number — e.g. "52.204-21", "1352.237-73", "252.204-7012". */
  section: string;
  /** Alternate designator if any — "I", "II", … (Roman). */
  alt: string | null;
  rawMatch: string;
  charOffset: number;
};

const PATTERNS: Array<{ authority: Authority; regex: RegExp }> = [
  // FAR clauses/provisions: 52.NNN-NN, optionally followed by "Alt I/II/..."
  // (with or without parentheses around the Alt designator).
  {
    authority: "FAR",
    regex:
      /\b(?:FAR\s+)?(52\.\d{3}-\d+)(?:[\s(]+Alt(?:ernate)?\s+([IVX]+)\)?)?/gi,
  },
  // Commerce CAR: 1352.NNN-NN
  {
    authority: "CAR",
    regex: /\b(?:CAR\s+)?(1352\.\d{3}-\d+)/gi,
  },
  // DFARS: 252.NNN-NNNN, optionally followed by "Alt ..."
  {
    authority: "DFARS",
    regex:
      /\b(?:DFARS\s+)?(252\.\d{3}-\d{4})(?:[\s(]+Alt(?:ernate)?\s+([IVX]+)\)?)?/gi,
  },
];

/**
 * Scan free text for FAR/CAR/DFARS references. De-duplicates on
 * `${authority}|${section}|${alt}`, keeping the earliest occurrence.
 */
export function extractClauseRefs(text: string): ClauseRef[] {
  const seen = new Map<string, ClauseRef>();
  for (const { authority, regex } of PATTERNS) {
    // Reset lastIndex defensively — these regexes are module-scoped.
    regex.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(text)) !== null) {
      const section = m[1];
      const alt = (m[2] || null) as string | null;
      const key = `${authority}|${section}|${alt ?? ""}`;
      if (seen.has(key)) continue;
      seen.set(key, {
        authority,
        section,
        alt,
        rawMatch: m[0],
        charOffset: m.index,
      });
    }
  }
  return Array.from(seen.values()).sort((a, b) => a.charOffset - b.charOffset);
}
