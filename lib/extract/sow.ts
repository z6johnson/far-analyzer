/**
 * Heuristic Statement-of-Work extractor. We look for a heading that looks
 * like an SoW marker and capture text up to the next ALL-CAPS heading or
 * a hard cap of ~6 KB. If no heading matches we hand back null and the
 * caller can fall back to the LLM-driven extractor.
 */
export function extractSow(text: string): string | null {
  const headingPattern =
    /\b(statement\s+of\s+work|scope\s+of\s+work|description\s+of\s+services|performance\s+work\s+statement|technical\s+description)\b/i;
  const m = text.match(headingPattern);
  if (!m || m.index === undefined) return null;

  const start = m.index;
  const window = text.slice(start, start + 8_000);

  // Stop when we hit the next ALL-CAPS heading line that's at least 4 chars
  // and doesn't itself contain the SoW marker (otherwise we'd cut on the SoW
  // heading itself).
  const stop = window
    .slice(m[0].length)
    .search(/\n\s*[A-Z][A-Z0-9 \-,/]{3,}\n/);

  const end =
    stop > 0 ? m[0].length + stop : Math.min(window.length, 6_000);

  return window.slice(0, end).trim();
}
