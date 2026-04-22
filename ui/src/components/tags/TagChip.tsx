import { X } from "lucide-react";
import type { Tag } from "../../lib/types.js";
import { cn } from "../../lib/cn.js";

interface Props {
  tag: Pick<Tag, "id" | "name" | "color">;
  onRemove?: () => void;
  size?: "sm" | "md";
  className?: string;
}

export function TagChip({ tag, onRemove, size = "md", className }: Props) {
  const tint = tag.color || "#7a746a";
  const sizeCls = size === "sm" ? "h-5 px-1.5 gap-1 text-[11px]" : "h-6 px-2 gap-1.5 text-[12px]";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full bg-[var(--hover-overlay)] text-[var(--color-text)]",
        "border border-[var(--color-border)]",
        "tabular-nums tracking-tight",
        sizeCls,
        className
      )}
      style={{ borderColor: `${tint}55` }}
    >
      <span
        aria-hidden="true"
        className="inline-block h-[6px] w-[6px] rounded-full shrink-0"
        style={{ backgroundColor: tint }}
      />
      <span className="truncate">{tag.name}</span>
      {onRemove ? (
        <button
          type="button"
          aria-label={`Remove ${tag.name}`}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          onPointerDown={(e) => e.stopPropagation()}
          className="ml-0.5 inline-flex items-center justify-center h-4 w-4 rounded-full text-[var(--color-text-subtle)] hover:text-[var(--color-text)] focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_var(--color-accent-ring)]"
        >
          <X size={10} />
        </button>
      ) : null}
    </span>
  );
}
