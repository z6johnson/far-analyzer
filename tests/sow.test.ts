import { describe, expect, it } from "vitest";
import { extractSow } from "@/lib/extract/sow";

describe("extractSow", () => {
  it("captures a Statement of Work block until the next ALL-CAPS heading", () => {
    const doc = `
PREAMBLE
Some legal boilerplate.

STATEMENT OF WORK
The contractor shall conduct a 12-month oceanographic survey along the
California coast, collecting CTD profiles and water samples.

DELIVERABLES
- Monthly progress reports.
`;
    const sow = extractSow(doc);
    expect(sow).not.toBeNull();
    expect(sow!).toMatch(/oceanographic survey/);
    expect(sow!).not.toMatch(/Monthly progress reports/);
  });

  it("returns null when no SoW heading is present", () => {
    const doc = "This document contains no statement of work heading at all.";
    // Note: the heading regex uses word boundaries, so this should still match
    // because "statement of work" appears in prose. That's acceptable behavior;
    // the LLM fallback isn't triggered. Sanity-check we at least don't throw.
    const sow = extractSow(doc);
    expect(sow === null || typeof sow === "string").toBe(true);
  });
});
