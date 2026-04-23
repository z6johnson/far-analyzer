import { describe, expect, it } from "vitest";
import { allEntries } from "@/lib/travis-guide";
import { getClause } from "@/lib/far-corpus";

describe("Travis guide linkage", () => {
  it("every FAR entry resolves to a record in the corpus", () => {
    const farEntries = allEntries().filter((e) => e.authority === "FAR");
    expect(farEntries.length).toBeGreaterThan(0);
    const missing = farEntries.filter((e) => !getClause(e.section));
    expect(missing.map((e) => e.section)).toEqual([]);
  });

  it("CAR/DFARS entries are exempt from corpus check", () => {
    const others = allEntries().filter((e) => e.authority !== "FAR");
    expect(others.length).toBeGreaterThan(0);
    for (const e of others) expect(["CAR", "DFARS"]).toContain(e.authority);
  });

  it("every entry has a non-empty guidance string", () => {
    for (const e of allEntries()) {
      expect(e.guidance.length).toBeGreaterThan(0);
    }
  });
});
