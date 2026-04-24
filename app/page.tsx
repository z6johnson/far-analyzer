"use client";

import { useCallback, useState } from "react";
import { Header } from "@/components/Header";
import { Disclaimer } from "@/components/Disclaimer";
import { Dropzone } from "@/components/Dropzone";
import { ResultsTable } from "@/components/ResultsTable";
import { FlagCountChip } from "@/components/FlagCountChip";
import type { AnalyzeEvent, ClauseRow, Flag } from "@/lib/schemas";

type Status =
  | { kind: "idle" }
  | { kind: "uploading"; filename: string }
  | { kind: "analyzing"; filename: string; expected: number }
  | { kind: "done"; filename: string; counts: Record<string, number> }
  | { kind: "error"; message: string };

export default function Page() {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [rows, setRows] = useState<ClauseRow[]>([]);
  const [errors, setErrors] = useState<string[]>([]);

  const reset = useCallback(() => {
    setStatus({ kind: "idle" });
    setRows([]);
    setErrors([]);
  }, []);

  const handleFile = useCallback(async (file: File) => {
    setRows([]);
    setErrors([]);
    setStatus({ kind: "uploading", filename: file.name });

    const fd = new FormData();
    fd.append("file", file);

    let resp: Response;
    try {
      resp = await fetch("/api/analyze", { method: "POST", body: fd });
    } catch (err) {
      setStatus({
        kind: "error",
        message:
          err instanceof Error ? err.message : "Network error contacting /api/analyze.",
      });
      return;
    }

    if (!resp.ok || !resp.body) {
      const detail = await resp
        .json()
        .then((j: { error?: string }) => j.error)
        .catch(() => undefined);
      setStatus({
        kind: "error",
        message: detail ?? `Server returned ${resp.status}.`,
      });
      return;
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let expected = 0;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf("\n")) !== -1) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        let event: AnalyzeEvent;
        try {
          event = JSON.parse(line);
        } catch {
          continue;
        }
        if (event.type === "clauses_found") {
          expected = event.count;
          setStatus({ kind: "analyzing", filename: file.name, expected });
        } else if (event.type === "row") {
          setRows((prev) => [...prev, event.row]);
        } else if (event.type === "error") {
          setErrors((prev) => [...prev, event.message]);
        } else if (event.type === "summary") {
          setStatus({
            kind: "done",
            filename: file.name,
            counts: event.counts,
          });
        }
      }
    }
  }, []);

  return (
    <main className="min-h-screen">
      <Header />
      <Disclaimer />

      <div className="mx-auto max-w-6xl px-8 py-10">
        {status.kind === "idle" && <Dropzone onFile={handleFile} />}

        {status.kind === "uploading" && (
          <p className="text-sm text-neutral-600">
            Uploading {status.filename}…
          </p>
        )}

        {status.kind === "analyzing" && (
          <div className="mb-6 flex items-baseline justify-between border-b border-neutral-200 pb-4">
            <div>
              <p className="display-tight text-base text-neutral-900">
                Analyzing {status.filename}
              </p>
              <p className="label-caps mt-1">
                {rows.length} of {status.expected} clauses
              </p>
            </div>
            <button
              type="button"
              onClick={reset}
              className="text-sm text-neutral-600 underline underline-offset-2 hover:text-neutral-900"
            >
              Cancel
            </button>
          </div>
        )}

        {status.kind === "done" && (
          <div className="mb-6 flex items-center justify-between border-b border-neutral-200 pb-4">
            <div>
              <p className="display-tight text-base text-neutral-900">
                {status.filename}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {(["red", "grey", "green", "unknown"] as const)
                  .filter((k) => (status.counts[k] ?? 0) > 0)
                  .map((k) => (
                    <FlagCountChip
                      key={k}
                      flag={k as Flag}
                      count={status.counts[k] ?? 0}
                    />
                  ))}
              </div>
            </div>
            <button
              type="button"
              onClick={reset}
              className="label-caps border border-neutral-900 bg-neutral-0 px-4 py-2 text-neutral-900 transition-colors hover:bg-neutral-900 hover:text-neutral-0"
            >
              Analyze another
            </button>
          </div>
        )}

        {status.kind === "error" && (
          <div className="mb-6 border-l-2 border-flag-red-fg bg-flag-red-bg px-4 py-3">
            <p className="label-caps text-flag-red-fg">Error</p>
            <p className="mt-1 text-sm text-flag-red-fg">{status.message}</p>
            <button
              type="button"
              onClick={reset}
              className="mt-3 text-sm text-flag-red-fg underline underline-offset-2"
            >
              Try again
            </button>
          </div>
        )}

        {(status.kind === "analyzing" ||
          status.kind === "done" ||
          rows.length > 0) && (
          <>
            <ResultsTable rows={rows} />
            {status.kind === "analyzing" && rows.length === 0 && (
              <p className="mt-6 text-sm text-neutral-600">
                Reading clauses…
              </p>
            )}
          </>
        )}

        {errors.length > 0 && (
          <details className="mt-6 text-xs text-neutral-600">
            <summary className="cursor-pointer">
              {errors.length} clause-level error{errors.length === 1 ? "" : "s"}
            </summary>
            <ul className="mt-2 space-y-1">
              {errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </main>
  );
}

