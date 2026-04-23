import type { RoleSource } from "../../lib/types.js";
import { cn } from "../../lib/cn.js";

const LABEL: Record<RoleSource, string> = {
  task: "set on this task",
  column: "inherited from column",
  board: "inherited from board",
};

const CLASSES: Record<RoleSource, string> = {
  task:
    "bg-[var(--color-accent-soft)] text-[var(--color-accent)] border-[color:var(--color-accent-ring)]",
  column:
    "bg-emerald-500/12 text-emerald-300 border-emerald-400/25",
  board:
    "bg-amber-500/14 text-amber-200 border-amber-400/30",
};

export function RoleSourceBadge({ source }: { source: RoleSource }) {
  return (
    <span
      data-testid={`role-source-${source}`}
      className={cn(
        "inline-flex items-center h-5 px-1.5 rounded text-[10px] tracking-tight border",
        CLASSES[source]
      )}
    >
      {LABEL[source]}
    </span>
  );
}
