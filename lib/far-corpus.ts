import { readFileSync } from "node:fs";
import path from "node:path";

export type FarRecord = {
  id: string;
  section: string;
  part: string;
  subpart: string | null;
  title: string;
  type: "part" | "subpart" | "section" | "clause" | "provision";
  effective_date: string | null;
  text: string;
  cross_references: string[];
  url: string;
  source_file: string;
  fac_through: string;
};

type Corpus = {
  bySection: Map<string, FarRecord>;
  /** Records whose type is `subpart`, keyed by the subpart id (e.g. "4.19"). */
  subparts: Map<string, FarRecord>;
};

let cache: Corpus | null = null;

function load(): Corpus {
  if (cache) return cache;
  const file = path.join(process.cwd(), "data", "far_rag.jsonl");
  const raw = readFileSync(file, "utf-8");
  const bySection = new Map<string, FarRecord>();
  const subparts = new Map<string, FarRecord>();
  for (const line of raw.split("\n")) {
    if (!line) continue;
    const rec = JSON.parse(line) as FarRecord;
    bySection.set(rec.section, rec);
    if (rec.type === "subpart") subparts.set(rec.section, rec);
  }
  cache = { bySection, subparts };
  return cache;
}

export function getClause(section: string): FarRecord | null {
  return load().bySection.get(section) ?? null;
}

export function getSubpart(subpart: string): FarRecord | null {
  return load().subparts.get(subpart) ?? null;
}

/**
 * Parse the leading "As prescribed in X.YY..." anchor out of a clause body
 * and return the prescribing subpart record. The text that follows the
 * anchor can cite a specific paragraph (e.g. "4.1903(a)"); we strip down to
 * the subpart id to get a stable lookup key.
 */
export function resolvePrescription(
  section: string,
): { subpart: string; url: string; text: string } | null {
  const rec = getClause(section);
  if (!rec || (rec.type !== "clause" && rec.type !== "provision")) return null;
  const m = rec.text.match(/as prescribed in\s+(\d+\.\d+)/i);
  if (!m) return null;
  const prescribedSection = m[1];
  // Try direct section hit first (sometimes prescriptions land on a section),
  // then fall back to the enclosing subpart (trim trailing digits).
  const direct = getClause(prescribedSection);
  if (direct) {
    return {
      subpart: direct.section,
      url: direct.url,
      text: direct.title,
    };
  }
  const subpartId = prescribedSection.replace(/(\d+\.\d)\d+/, "$1");
  const sub = getSubpart(subpartId);
  if (sub) {
    return {
      subpart: sub.section,
      url: sub.url,
      text: sub.title,
    };
  }
  return null;
}

export function assertCorpusLoaded(): void {
  const probe = getClause("52.204-21");
  if (!probe) {
    throw new Error(
      "FAR corpus failed to load: 52.204-21 missing. Check data/far_rag.jsonl bundling.",
    );
  }
}
