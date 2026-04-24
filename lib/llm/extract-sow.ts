import { callLlm } from "./call";

const SYSTEM_PROMPT = `You extract the Statement of Work (SoW) or scope-of-services
section from a contract document. Return ONLY the verbatim SoW text. If the
document does not contain an explicit SoW, return the paragraph that most
clearly describes the work to be performed. Output plain text only — no
preamble, no markdown, no commentary.`;

/**
 * LLM fallback used when the heading-based extractor finds nothing.
 * Sends the first ~12 KB of the document and asks for the SoW span verbatim.
 */
export async function llmExtractSow(
  text: string,
  signal?: AbortSignal,
): Promise<string> {
  const sample = text.slice(0, 12_000);
  const { text: result } = await callLlm({
    system: SYSTEM_PROMPT,
    user: `Extract the Statement of Work from this document:\n\n${sample}`,
    maxTokens: 2_000,
    signal,
  });
  return result;
}
