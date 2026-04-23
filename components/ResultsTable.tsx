"use client";

import { useState } from "react";
import type { ClauseRow } from "@/lib/schemas";
import { FlagBadge } from "./FlagBadge";
import { RowDetail } from "./RowDetail";

const FLAG_ORDER: Record<ClauseRow["flag"], number> = {
  red: 0,
  grey: 1,
  unknown: 2,
  green: 3,
};

function sortRows(rows: ClauseRow[]): ClauseRow[] {
  return [...rows].sort((a, b) => {
    const f = FLAG_ORDER[a.flag] - FLAG_ORDER[b.flag];
    if (f !== 0) return f;
    return a.section.localeCompare(b.section, undefined, { numeric: true });
  });
}

export function ResultsTable({ rows }: { rows: ClauseRow[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const sorted = sortRows(rows);

  if (sorted.length === 0) return null;

  return (
    <div className="border border-neutral-200">
      <div className="grid grid-cols-[110px_140px_1fr_1fr] gap-4 border-b border-neutral-200 bg-neutral-50 px-4 py-2">
        <span className="label-caps">Flag</span>
        <span className="label-caps">Clause</span>
        <span className="label-caps">Rationale</span>
        <span className="label-caps">SoW Relevance</span>
      </div>
      <ul>
        {sorted.map((row) => {
          const id = `${row.authority}|${row.section}|${row.alt ?? ""}`;
          const isOpen = open === id;
          return (
            <li
              key={id}
              className="border-b border-neutral-200 last:border-b-0"
            >
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : id)}
                className="grid w-full grid-cols-[110px_140px_1fr_1fr] gap-4 px-4 py-3 text-left hover:bg-neutral-50"
              >
                <span className="flex items-start">
                  <FlagBadge flag={row.flag} />
                </span>
                <span className="text-sm">
                  <span className="block font-mono font-medium text-neutral-900">
                    {row.authority} {row.section}
                    {row.alt ? ` Alt ${row.alt}` : ""}
                  </span>
                  <span className="block text-xs text-neutral-600">
                    {row.title}
                  </span>
                  {row.prescription.subpart && row.prescription.url && (
                    <a
                      href={row.prescription.url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 block text-xs text-neutral-600 underline decoration-neutral-300 underline-offset-2 hover:decoration-neutral-900"
                      onClick={(e) => e.stopPropagation()}
                    >
                      Prescribed at {row.prescription.subpart}
                    </a>
                  )}
                </span>
                <span className="text-sm leading-6 text-neutral-800">
                  {row.rationale}
                </span>
                <span className="text-sm leading-6 text-neutral-800">
                  {row.sow_relevance || (
                    <span className="text-neutral-400">—</span>
                  )}
                </span>
              </button>
              {isOpen && <RowDetail row={row} />}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
