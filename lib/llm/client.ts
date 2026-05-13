import OpenAI from "openai";

let cached: OpenAI | null = null;

/**
 * Strip leading/trailing whitespace from env vars. Pasted secrets frequently
 * carry trailing newlines or spaces that break auth silently — this ensures
 * the SDK sees exactly the token the user intended.
 */
function clean(v: string | undefined): string | undefined {
  if (v === undefined) return undefined;
  const t = v.trim();
  return t.length > 0 ? t : undefined;
}

/**
 * OpenAI SDK pointed at the LiteLLM proxy. LITELLM_API_KEY and LITELLM_BASE_URL
 * must both be set; otherwise this throws so the analyze route returns a clear
 * 500 instead of failing inside the per-clause loop.
 */
export function getLlmClient(): OpenAI {
  if (cached) return cached;
  const apiKey = clean(process.env.LITELLM_API_KEY);
  const baseURL = clean(process.env.LITELLM_BASE_URL)?.replace(/\/+$/, "");
  if (!apiKey || !baseURL) {
    throw new Error(
      "LITELLM_API_KEY and LITELLM_BASE_URL must be set for the analyze route.",
    );
  }
  cached = new OpenAI({ apiKey, baseURL });
  return cached;
}

export function getModel(): string {
  const model = clean(process.env.ANTHROPIC_MODEL);
  if (!model) {
    throw new Error("ANTHROPIC_MODEL must be set for the analyze route.");
  }
  return model;
}
