import Anthropic from "@anthropic-ai/sdk";

let cached: Anthropic | null = null;

function clean(v: string | undefined): string | undefined {
  if (v === undefined) return undefined;
  const t = v.trim();
  return t.length > 0 ? t : undefined;
}

/**
 * Returns a direct Anthropic API client if ANTHROPIC_API_KEY is set, otherwise
 * null. Pinned to api.anthropic.com so a stray ANTHROPIC_BASE_URL env var (left
 * over from LiteLLM-style config) can't accidentally route the fallback back
 * through the same broken proxy.
 */
export function getAnthropicClient(): Anthropic | null {
  if (cached) return cached;
  const apiKey = clean(process.env.ANTHROPIC_API_KEY);
  if (!apiKey) return null;
  cached = new Anthropic({
    apiKey,
    baseURL: "https://api.anthropic.com",
  });
  return cached;
}

export function hasAnthropicFallback(): boolean {
  return Boolean(clean(process.env.ANTHROPIC_API_KEY));
}
