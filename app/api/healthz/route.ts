import { getLlmClient, getModel } from "@/lib/llm/client";

export const runtime = "nodejs";
export const maxDuration = 30;

type ProbeResult = {
  ok: boolean;
  status?: number | null;
  detail?: string;
  model?: string;
};

function sanitizeErr(err: unknown): ProbeResult {
  const status =
    typeof err === "object" && err !== null && "status" in err
      ? (err as { status?: number }).status
      : undefined;
  let detail: string;
  if (status === 401 || status === 403) {
    detail = "Auth rejected. Key reaches the service but isn't recognized.";
  } else if (status === 429) {
    detail = "Rate limited.";
  } else if (typeof status === "number" && status >= 500) {
    detail = `Service returned ${status}.`;
  } else {
    const msg = err instanceof Error ? err.message : String(err);
    detail = msg.split(/\r?\n/, 1)[0].slice(0, 160);
  }
  return { ok: false, status: status ?? null, detail };
}

async function probeLitellm(model: string): Promise<ProbeResult> {
  try {
    const client = getLlmClient();
    const resp = await client.chat.completions.create({
      model,
      max_tokens: 5,
      messages: [{ role: "user", content: "ping" }],
    });
    return { ok: true, model: resp.model };
  } catch (err) {
    return sanitizeErr(err);
  }
}

/**
 * GET /api/healthz — probes the LiteLLM proxy and reports status. Useful for
 * diagnosing "why does every row fail?" from the deployed URL without
 * uploading a PDF. Never echoes the API key or provider debug payloads.
 */
export async function GET() {
  const env = {
    LITELLM_API_KEY: Boolean(process.env.LITELLM_API_KEY?.trim()),
    LITELLM_BASE_URL: Boolean(process.env.LITELLM_BASE_URL?.trim()),
    ANTHROPIC_MODEL: Boolean(process.env.ANTHROPIC_MODEL?.trim()),
    litellm_base_url_host: process.env.LITELLM_BASE_URL?.trim()
      ? (() => {
          try {
            return new URL(process.env.LITELLM_BASE_URL!.trim()).host;
          } catch {
            return "invalid-url";
          }
        })()
      : null,
  };

  if (!env.LITELLM_API_KEY || !env.LITELLM_BASE_URL || !env.ANTHROPIC_MODEL) {
    return Response.json(
      {
        ok: false,
        env,
        detail: "LITELLM_API_KEY, LITELLM_BASE_URL, and ANTHROPIC_MODEL are required.",
      },
      { status: 500 },
    );
  }

  let model: string;
  try {
    model = getModel();
  } catch (err) {
    return Response.json(
      { ok: false, env, detail: err instanceof Error ? err.message : "model" },
      { status: 500 },
    );
  }

  const litellm = await probeLitellm(model);

  return Response.json(
    { ok: litellm.ok, env, litellm },
    { status: litellm.ok ? 200 : 502 },
  );
}
