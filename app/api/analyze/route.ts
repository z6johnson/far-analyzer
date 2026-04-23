import { NextRequest } from "next/server";
import { extractPdfText } from "@/lib/extract/pdf";
import { extractClauseRefs } from "@/lib/extract/clauses";
import { extractSow } from "@/lib/extract/sow";
import { llmExtractSow } from "@/lib/llm/extract-sow";
import { analyzeClause } from "@/lib/llm/analyze-clause";
import { makeLimiter } from "@/lib/concurrency";
import { assertCorpusLoaded } from "@/lib/far-corpus";
import type { AnalyzeEvent } from "@/lib/schemas";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_BYTES = 10 * 1024 * 1024;
const PER_CALL_TIMEOUT_MS = 30_000;

function ndjson(event: AnalyzeEvent): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(event)}\n`);
}

async function readUpload(req: NextRequest): Promise<{
  bytes: Uint8Array;
  mime: string;
}> {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new Error("No file uploaded.");
  if (file.size > MAX_BYTES) {
    throw new Error(`File exceeds ${MAX_BYTES / 1_048_576} MB limit.`);
  }
  const allowed = ["application/pdf", "text/plain"];
  if (file.type && !allowed.includes(file.type)) {
    throw new Error(`Unsupported file type: ${file.type}. Upload PDF or TXT.`);
  }
  return { bytes: new Uint8Array(await file.arrayBuffer()), mime: file.type };
}

export async function POST(req: NextRequest) {
  try {
    assertCorpusLoaded();
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "corpus" }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }

  let bytes: Uint8Array;
  let mime: string;
  try {
    ({ bytes, mime } = await readUpload(req));
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "upload" }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  let docText: string;
  try {
    if (mime === "text/plain") {
      docText = new TextDecoder().decode(bytes);
    } else {
      const result = await extractPdfText(bytes);
      docText = result.text;
    }
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "parse" }),
      { status: 422, headers: { "content-type": "application/json" } },
    );
  }

  const refs = extractClauseRefs(docText);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const counts = { green: 0, red: 0, grey: 0, unknown: 0 };
      const send = (e: AnalyzeEvent) => controller.enqueue(ndjson(e));

      let sow = extractSow(docText) ?? "";
      if (!sow) {
        try {
          sow = await llmExtractSow(docText);
        } catch {
          sow = "";
        }
      }

      send({
        type: "clauses_found",
        count: refs.length,
        sow_excerpt_chars: sow.length,
      });

      if (refs.length === 0) {
        send({ type: "summary", counts });
        controller.close();
        return;
      }

      const limit = makeLimiter();

      await Promise.allSettled(
        refs.map((ref) =>
          limit(async () => {
            const ac = new AbortController();
            const timer = setTimeout(() => ac.abort(), PER_CALL_TIMEOUT_MS);
            try {
              const row = await analyzeClause(
                {
                  authority: ref.authority,
                  section: ref.section,
                  alt: ref.alt,
                  sow,
                },
                ac.signal,
              );
              counts[row.flag] += 1;
              send({ type: "row", row });
            } catch (err) {
              send({
                type: "error",
                message: `${ref.authority} ${ref.section}: ${
                  err instanceof Error ? err.message : String(err)
                }`,
              });
            } finally {
              clearTimeout(timer);
            }
          }),
        ),
      );

      send({ type: "summary", counts });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
