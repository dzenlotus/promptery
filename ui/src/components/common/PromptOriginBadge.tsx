import type { PromptOrigin } from "../../lib/types.js";
import { cn } from "../../lib/cn.js";

/** Short user-facing label per origin. */
const LABEL: Record<PromptOrigin, string> = {
  direct: "direct",
  role: "role",
  column: "column",
  "column-role": "column · role",
  board: "board",
  "board-role": "board · role",
};

/**
 * Colour families mirror the three layers of the hierarchy. Specific origins
 * (direct, role) use a stronger tint than ambient ones (column, board).
 */
const CLASSES: Record<PromptOrigin, string> = {
  direct:
    "bg-[var(--color-accent-soft)] text-[var(--color-accent)] border-[color:var(--color-accent-ring)]",
  role:
    "bg-blue-500/14 text-blue-300 border-blue-400/30",
  column:
    "bg-emerald-500/12 text-emerald-300 border-emerald-400/25",
  "column-role":
    "bg-emerald-500/8 text-emerald-200/85 border-emerald-400/20",
  board:
    "bg-amber-500/14 text-amber-200 border-amber-400/30",
  "board-role":
    "bg-amber-500/8 text-amber-200/80 border-amber-400/20",
};

interface Props {
  origin: PromptOrigin;
  /** Optional source label appended to the tooltip — e.g. the role name. */
  sourceName?: string;
}

export function PromptOriginBadge({ origin, sourceName }: Props) {
  const label = LABEL[origin];
  const title = sourceName ? `${label} — ${sourceName}` : label;
  return (
    <span
      title={title}
      data-testid={`prompt-origin-${origin}`}
      className={cn(
        "inline-flex items-center h-4 px-1.5 rounded text-[10px] tracking-tight border",
        CLASSES[origin]
      )}
    >
      {label}
    </span>
  );
}
