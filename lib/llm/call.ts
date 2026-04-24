import Anthropic from "@anthropic-ai/sdk";
import { getLlmClient, getModel } from "./client";
import { getAnthropicClient, hasAnthropicFallback } from "./anthropic-client";

export type CallLlmOptions = {
  system: string;
  user: string;
  maxTokens: number;
  signal?: AbortSignal;
};

export type CallLlmResult = {
  text: string;
  provider: "litellm" | "anthropic";
};

/**
 * HTTP status codes where we prefer to fall back to the direct Anthropic API
 * rather than surface the error. 4xx other than 400/404 (auth, permission,
 * rate limit) can be transient or proxy-specific; 5xx is always worth retry.
 */
function shouldFallback(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const status = (err as { status?: number }).status;
  if (status === undefined) {
    // Network-level failures (no status) — try fallback once.
    return true;
  }
  if (status === 401 || status === 403 || status === 429) return true;
  if (status >= 500) return true;
  return false;
}

/**
 * Primary: LiteLLM proxy via the OpenAI SDK. On auth / 5xx / 429 / network
 * failure, fall back to the direct Anthropic API if ANTHROPIC_API_KEY is set.
 * The model name (ANTHROPIC_MODEL) is shared between both paths.
 */
export async function callLlm(opts: CallLlmOptions): Promise<CallLlmResult> {
  const model = getModel();

  // Primary path.
  try {
    const client = getLlmClient();
    const resp = await client.chat.completions.create(
      {
        model,
        max_tokens: opts.maxTokens,
        temperature: 0,
        messages: [
          { role: "system", content: opts.system },
          { role: "user", content: opts.user },
        ],
      },
      { signal: opts.signal },
    );
    const text = resp.choices[0]?.message?.content?.trim() ?? "";
    return { text, provider: "litellm" };
  } catch (err) {
    if (!shouldFallback(err) || !hasAnthropicFallback()) {
      throw err;
    }
  }

  // Fallback path — direct Anthropic API.
  const anthropic = getAnthropicClient();
  if (!anthropic) {
    throw new Error(
      "LLM fallback unavailable: ANTHROPIC_API_KEY is not set in this environment.",
    );
  }

  // Cache the system prompt — silently no-ops on prompts below the 2048-token
  // minimum but saves ~90% on larger system prompts if we grow them later.
  const system: Anthropic.TextBlockParam[] = [
    { type: "text", text: opts.system, cache_control: { type: "ephemeral" } },
  ];

  const resp = await anthropic.messages.create(
    {
      model,
      max_tokens: opts.maxTokens,
      system,
      messages: [{ role: "user", content: opts.user }],
    },
    { signal: opts.signal },
  );

  const text = resp.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

  return { text, provider: "anthropic" };
}
