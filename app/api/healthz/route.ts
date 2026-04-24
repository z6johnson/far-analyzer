import { getModel } from "@/lib/llm/client";
import { getAnthropicClient } from "@/lib/llm/anthropic-client";

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

async function probeAnthropic(model: string): Promise<ProbeResult> {
  const client = getAnthropicClient();
  if (!client) {
    return { ok: false, detail: "ANTHROPIC_API_KEY not set." };
  }
  try {
    const resp = await client.messages.create({
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
 * GET /api/healthz — probes the Anthropic API and reports status. Useful for
 * diagnosing "why does every row fail?" from the deployed URL without
 * uploading a PDF. Never echoes the API key or provider debug payloads.
 */
export async function GET() {
  const env = {
    ANTHROPIC_API_KEY: Boolean(process.env.ANTHROPIC_API_KEY?.trim()),
    ANTHROPIC_MODEL: Boolean(process.env.ANTHROPIC_MODEL?.trim()),
  };

  if (!env.ANTHROPIC_MODEL) {
    return Response.json(
      { ok: false, env, detail: "ANTHROPIC_MODEL is required." },
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

  const anthropic = env.ANTHROPIC_API_KEY
    ? await probeAnthropic(model)
    : { ok: false, detail: "ANTHROPIC_API_KEY is not set." };

  return Response.json(
    { ok: anthropic.ok, env, anthropic },
    { status: anthropic.ok ? 200 : 502 },
  );
}
