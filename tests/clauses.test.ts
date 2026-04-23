import { describe, expect, it } from "vitest";
import { extractClauseRefs } from "@/lib/extract/clauses";

describe("extractClauseRefs", () => {
  it("finds FAR, CAR, and DFARS references mixed in prose", () => {
    const text = `
      The contractor shall comply with FAR 52.204-21 and FAR 52.227-14 Alternate IV.
      Additionally, FAR 52.212-4 (Alt I) applies. The Department of Commerce CAR clause
      1352.237-73 is incorporated by reference. For DoD work, DFARS 252.204-7012 and
      DFARS 252.227-7013 apply. Plain section 52.204-25 is also included.
    `;
    const refs = extractClauseRefs(text);
    const sections = refs.map((r) => `${r.authority}:${r.section}:${r.alt ?? ""}`);

    expect(sections).toContain("FAR:52.204-21:");
    expect(sections).toContain("FAR:52.227-14:IV");
    expect(sections).toContain("FAR:52.212-4:I");
    expect(sections).toContain("CAR:1352.237-73:");
    expect(sections).toContain("DFARS:252.204-7012:");
    expect(sections).toContain("DFARS:252.227-7013:");
    expect(sections).toContain("FAR:52.204-25:");
  });

  it("dedupes repeated mentions", () => {
    const text = "FAR 52.204-21 ... see also FAR 52.204-21 again.";
    const refs = extractClauseRefs(text);
    expect(refs).toHaveLength(1);
  });

  it("returns refs sorted by occurrence", () => {
    const text = "DFARS 252.204-7012 first, then FAR 52.204-21 second.";
    const refs = extractClauseRefs(text);
    expect(refs[0].authority).toBe("DFARS");
    expect(refs[1].authority).toBe("FAR");
  });
});
