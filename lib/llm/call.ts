import { getLlmClient, getModel } from "./client";

export type CallLlmOptions = {
  system: string;
  user: string;
  maxTokens: number;
  signal?: AbortSignal;
};

export type CallLlmResult = {
  text: string;
  provider: "litellm";
};

/**
 * LiteLLM proxy call via the OpenAI SDK. The direct Anthropic API path was
 * removed — see git history for the previous implementation if it needs to
 * be restored.
 */
export async function callLlm(opts: CallLlmOptions): Promise<CallLlmResult> {
  const model = getModel();
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
}
