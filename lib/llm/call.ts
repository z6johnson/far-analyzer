import Anthropic from "@anthropic-ai/sdk";
import { getModel } from "./client";
import { getAnthropicClient } from "./anthropic-client";
// LiteLLM path temporarily disabled — see getLlmClient / hasAnthropicFallback.
// import { getLlmClient } from "./client";
// import { hasAnthropicFallback } from "./anthropic-client";

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

// LiteLLM fallback predicate — kept for when the proxy path is re-enabled.
// function shouldFallback(err: unknown): boolean {
//   if (!err || typeof err !== "object") return false;
//   const status = (err as { status?: number }).status;
//   if (status === undefined) return true;
//   if (status === 401 || status === 403 || status === 429) return true;
//   if (status >= 500) return true;
//   return false;
// }

/**
 * Direct Anthropic API only. LiteLLM proxy path is commented out — restore
 * the primary try/catch block below to re-enable it.
 */
export async function callLlm(opts: CallLlmOptions): Promise<CallLlmResult> {
  const model = getModel();

  // --- LiteLLM primary path (disabled) ---
  // try {
  //   const client = getLlmClient();
  //   const resp = await client.chat.completions.create(
  //     {
  //       model,
  //       max_tokens: opts.maxTokens,
  //       temperature: 0,
  //       messages: [
  //         { role: "system", content: opts.system },
  //         { role: "user", content: opts.user },
  //       ],
  //     },
  //     { signal: opts.signal },
  //   );
  //   const text = resp.choices[0]?.message?.content?.trim() ?? "";
  //   return { text, provider: "litellm" };
  // } catch (err) {
  //   if (!shouldFallback(err) || !hasAnthropicFallback()) {
  //     throw err;
  //   }
  // }

  const anthropic = getAnthropicClient();
  if (!anthropic) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set in this environment.",
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
