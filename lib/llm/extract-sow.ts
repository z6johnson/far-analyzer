import { getLlmClient, getModel } from "./client";

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
  const client = getLlmClient();
  const model = getModel();
  const sample = text.slice(0, 12_000);
  const resp = await client.chat.completions.create(
    {
      model,
      max_tokens: 2_000,
      temperature: 0,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Extract the Statement of Work from this document:\n\n${sample}`,
        },
      ],
    },
    { signal },
  );
  return resp.choices[0]?.message?.content?.trim() ?? "";
}
