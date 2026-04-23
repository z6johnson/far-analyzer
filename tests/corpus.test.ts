import { describe, expect, it } from "vitest";
import { getClause, resolvePrescription } from "@/lib/far-corpus";

describe("FAR corpus", () => {
  it("loads 52.204-21 with title and url", () => {
    const rec = getClause("52.204-21");
    expect(rec).not.toBeNull();
    expect(rec?.title).toMatch(/Basic Safeguarding/);
    expect(rec?.url).toBe("https://www.acquisition.gov/far/52.204-21");
  });

  it("loads a Part 15 section", () => {
    const rec = getClause("15.404-1");
    expect(rec).not.toBeNull();
  });

  it("resolves the prescription for 52.204-21", () => {
    const prescription = resolvePrescription("52.204-21");
    expect(prescription).not.toBeNull();
    expect(prescription?.subpart).toMatch(/^4\./);
    expect(prescription?.url).toMatch(/acquisition\.gov\/far/);
  });
});
