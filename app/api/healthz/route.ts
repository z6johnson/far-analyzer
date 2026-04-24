import { getLlmClient, getModel } from "@/lib/llm/client";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * GET /api/healthz — one-shot ping against the LiteLLM proxy.
 *
 * Reports whether env vars are present and whether the configured model
 * responds to a 5-token "ping" request. Returns status codes only — never
 * echoes the API key or provider debug payloads. Useful for diagnosing
 * "why does every row fail?" from the deployed environment without
 * uploading a PDF.
 */
export async function GET() {
  const env = {
    LITELLM_API_KEY: Boolean(process.env.LITELLM_API_KEY?.trim()),
    LITELLM_BASE_URL: Boolean(process.env.LITELLM_BASE_URL?.trim()),
    ANTHROPIC_MODEL: Boolean(process.env.ANTHROPIC_MODEL?.trim()),
    base_url_host: process.env.LITELLM_BASE_URL?.trim()
      ? (() => {
          try {
            return new URL(process.env.LITELLM_BASE_URL!.trim()).host;
          } catch {
            return "invalid";
          }
        })()
      : null,
  };

  if (!env.LITELLM_API_KEY || !env.LITELLM_BASE_URL || !env.ANTHROPIC_MODEL) {
    return Response.json(
      { ok: false, stage: "env", env, detail: "Missing one or more env vars." },
      { status: 500 },
    );
  }

  let client;
  try {
    client = getLlmClient();
  } catch (err) {
    return Response.json(
      {
        ok: false,
        stage: "client",
        env,
        detail: err instanceof Error ? err.message : "client init failed",
      },
      { status: 500 },
    );
  }

  try {
    const resp = await client.chat.completions.create({
      model: getModel(),
      max_tokens: 5,
      messages: [{ role: "user", content: "ping" }],
    });
    return Response.json({
      ok: true,
      stage: "llm",
      env,
      model: resp.model,
      response_id: resp.id,
    });
  } catch (err) {
    const status =
      typeof err === "object" && err !== null && "status" in err
        ? (err as { status?: number }).status
        : undefined;
    let detail: string;
    if (status === 401 || status === 403) {
      detail =
        "Auth rejected by the LLM proxy. The key is reaching the proxy but the proxy's token registry doesn't recognize it.";
    } else if (status === 429) {
      detail = "Rate limited by the LLM proxy.";
    } else if (typeof status === "number" && status >= 500) {
      detail = `LLM proxy returned ${status}.`;
    } else {
      const msg = err instanceof Error ? err.message : String(err);
      detail = msg.split(/\r?\n/, 1)[0].slice(0, 160);
    }
    return Response.json(
      { ok: false, stage: "llm", env, status: status ?? null, detail },
      { status: 502 },
    );
  }
}
