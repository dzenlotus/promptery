import type { MouseEvent, ReactNode } from "react";
import { cn } from "../../lib/cn.js";
import type { Tag } from "../../lib/types.js";

interface Props {
  tag: Pick<Tag, "id" | "name" | "color">;
  /** Highlights the chip — used by the active filter chip and tag-picker. */
  selected?: boolean;
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  /** Slot for a trailing icon (e.g. an X to remove). */
  trailing?: ReactNode;
  /** Optional test id for the rendered button. */
  "data-testid"?: string;
}

/**
 * Render a single tag as a tiny pill. Colour comes from the tag's `color`
 * field (a small left dot) — the chip body is intentionally neutral so a
 * row of chips reads as labels, not brand stickers. Falls back to a muted
 * dot when the tag has no colour.
 */
export function TagChip({
  tag,
  selected = false,
  onClick,
  trailing,
  "data-testid": testId,
}: Props) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 px-1.5 h-5 rounded-full",
        "border text-[10px] leading-none transition-colors",
        selected
          ? "border-[var(--color-accent)] bg-[var(--color-accent-soft,var(--hover-overlay))] text-[var(--color-text)]"
          : "border-[var(--color-border)] bg-[var(--hover-overlay)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]",
        // Cursor / focus states only when interactive — purely decorative
        // chips (no onClick) shouldn't suggest a click target.
        onClick
          ? "cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent)]"
          : "cursor-default"
      )}
    >
      <span
        aria-hidden
        className="h-1.5 w-1.5 rounded-full shrink-0"
        style={{ backgroundColor: tag.color || "#7a746a" }}
      />
      <span className="truncate max-w-[100px]">{tag.name}</span>
      {trailing}
    </button>
  );
}
