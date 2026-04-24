import Anthropic from "@anthropic-ai/sdk";
import { getModel } from "./client";
import { getAnthropicClient } from "./anthropic-client";

export type CallLlmOptions = {
  system: string;
  user: string;
  maxTokens: number;
  signal?: AbortSignal;
};

export type CallLlmResult = {
  text: string;
  provider: "anthropic";
};

/**
 * Direct Anthropic API call. The LiteLLM proxy path was removed — see git
 * history for the previous implementation if it needs to be restored.
 */
export async function callLlm(opts: CallLlmOptions): Promise<CallLlmResult> {
  const model = getModel();

  const anthropic = getAnthropicClient();
  if (!anthropic) {
    throw new Error("ANTHROPIC_API_KEY is not set in this environment.");
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
