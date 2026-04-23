import type { Flag } from "@/lib/schemas";

const STYLES: Record<Flag, { bg: string; fg: string; label: string }> = {
  green: { bg: "bg-flag-green-bg", fg: "text-flag-green-fg", label: "Green" },
  red: { bg: "bg-flag-red-bg", fg: "text-flag-red-fg", label: "Red" },
  grey: { bg: "bg-flag-grey-bg", fg: "text-flag-grey-fg", label: "Grey" },
  unknown: {
    bg: "bg-flag-unknown-bg",
    fg: "text-flag-unknown-fg",
    label: "Unknown",
  },
};

export function FlagBadge({ flag }: { flag: Flag }) {
  const s = STYLES[flag];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-bold uppercase tracking-wider ${s.bg} ${s.fg}`}
    >
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />
      {s.label}
    </span>
  );
}
