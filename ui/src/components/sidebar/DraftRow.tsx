import { cn } from "../../lib/cn.js";
import { ColorDot } from "./ColorDot.js";
import { DRAFT_COLOR } from "./colors.js";

interface Props {
  placeholder: string;
  name?: string;
  selected: boolean;
  onSelect: () => void;
  testId?: string;
}

/**
 * Placeholder row for a locally-created draft that hasn't been saved yet.
 * Muted italic text with a grey dot so it clearly reads as pending.
 */
export function DraftRow({ placeholder, name, selected, onSelect, testId }: Props) {
  const display = name?.trim() || placeholder;
  const isPlaceholder = !name?.trim();
  return (
    <div
      role="button"
      tabIndex={0}
      data-testid={testId ?? "sidebar-draft-row"}
      data-selected={selected || undefined}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        "group relative grid grid-cols-[auto_1fr] items-center gap-2 h-9 pr-2 pl-3 rounded-md cursor-pointer",
        "transition-colors duration-150 select-none",
        selected
          ? "bg-[var(--color-accent-soft)] text-[var(--color-text)]"
          : "hover:bg-[var(--hover-overlay)] text-[var(--color-text)]"
      )}
    >
      <ColorDot color={DRAFT_COLOR} size={8} />
      <span
        className={cn(
          "truncate text-[13px] tracking-tight",
          isPlaceholder
            ? "italic opacity-70 text-[var(--color-text-muted)]"
            : "text-[var(--color-text)]"
        )}
      >
        {display}
      </span>
    </div>
  );
}
