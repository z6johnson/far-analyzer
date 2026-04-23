import OpenAI from "openai";

let cached: OpenAI | null = null;

export function getLlmClient(): OpenAI {
  if (cached) return cached;
  const apiKey = process.env.LITELLM_API_KEY;
  const baseURL = process.env.LITELLM_BASE_URL;
  if (!apiKey || !baseURL) {
    throw new Error(
      "LITELLM_API_KEY and LITELLM_BASE_URL must be set for the analyze route.",
    );
  }
  cached = new OpenAI({ apiKey, baseURL });
  return cached;
}

export function getModel(): string {
  const model = process.env.ANTHROPIC_MODEL;
  if (!model) {
    throw new Error("ANTHROPIC_MODEL must be set for the analyze route.");
  }
  return model;
}
