import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

export const GuideEntry = z.object({
  section: z.string(),
  authority: z.enum(["FAR", "CAR", "DFARS"]),
  flag: z.enum(["green", "red", "grey"]),
  title: z.string().optional(),
  guidance: z.string(),
  suggested_justification: z.string().optional(),
  question_for_pi: z.string().optional(),
  alt_guidance: z
    .array(z.object({ alt: z.string(), note: z.string() }))
    .optional(),
  notes: z.array(z.string()).optional(),
});
export type GuideEntry = z.infer<typeof GuideEntry>;

const GuideFile = z.object({
  source: z.string(),
  version: z.string(),
  entries: z.array(GuideEntry),
});

let cache: Map<string, GuideEntry> | null = null;

function load(): Map<string, GuideEntry> {
  if (cache) return cache;
  const file = path.join(process.cwd(), "data", "travis-guide.json");
  const parsed = GuideFile.parse(JSON.parse(readFileSync(file, "utf-8")));
  cache = new Map(parsed.entries.map((e) => [e.section, e]));
  return cache;
}

export function getGuideEntry(section: string): GuideEntry | null {
  return load().get(section) ?? null;
}

export function allEntries(): GuideEntry[] {
  return Array.from(load().values());
}
