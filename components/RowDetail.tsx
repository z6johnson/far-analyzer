"use client";

import { useState } from "react";
import type { ClauseRow } from "@/lib/schemas";

type LocalState = "open" | "edited" | "rejected";

export function RowDetail({ row }: { row: ClauseRow }) {
  const [state, setState] = useState<LocalState>("open");
  const [notes, setNotes] = useState("");

  return (
    <div className="border-l-2 border-neutral-900 bg-neutral-50 px-6 py-5">
      <div className="grid gap-5 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-4">
          <section>
            <h4 className="label-caps mb-1">Negotiation Strategy</h4>
            <p className="text-sm leading-6 text-neutral-800">
              {row.negotiation_strategy || "—"}
            </p>
          </section>

          {row.pi_questions.length > 0 && (
            <section>
              <h4 className="label-caps mb-1">Questions for PI</h4>
              <ul className="list-disc space-y-1 pl-5 text-sm text-neutral-800">
                {row.pi_questions.map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <h4 className="label-caps mb-1">Officer Notes (local only)</h4>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full border border-neutral-300 bg-white px-2 py-1 text-sm focus:border-neutral-900 focus:outline-none"
              placeholder="Notes never leave your browser."
            />
          </section>
        </div>

        <div className="space-y-4">
          <section>
            <h4 className="label-caps mb-1">Sources</h4>
            <ul className="space-y-1 text-sm">
              {row.sources.map((s, i) => (
                <li key={i}>
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-neutral-900 underline decoration-neutral-400 underline-offset-2 hover:decoration-neutral-900"
                  >
                    {s.label}
                  </a>
                </li>
              ))}
              {row.flag_source === "travis_guide" && (
                <li className="text-neutral-600">Travis Guide entry applied</li>
              )}
              {row.source_confidence === "model" && (
                <li className="text-flag-unknown-fg">
                  Model-sourced — verify against the published clause
                </li>
              )}
            </ul>
          </section>

          <section className="flex gap-2">
            <button
              type="button"
              onClick={() => setState("edited")}
              className="border border-neutral-900 bg-white px-3 py-1 text-xs font-bold uppercase tracking-wider text-neutral-900 hover:bg-neutral-100"
            >
              Mark Edited
            </button>
            <button
              type="button"
              onClick={() => setState("rejected")}
              className="border border-neutral-900 bg-white px-3 py-1 text-xs font-bold uppercase tracking-wider text-neutral-900 hover:bg-neutral-100"
            >
              Reject
            </button>
            <button
              type="button"
              onClick={() => setState("open")}
              className="px-3 py-1 text-xs font-bold uppercase tracking-wider text-neutral-600 hover:text-neutral-900"
            >
              Reset
            </button>
          </section>

          {state !== "open" && (
            <p className="label-caps">
              {state === "edited"
                ? "Marked Edited (local)"
                : "Marked Rejected (local)"}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
