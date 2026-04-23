import { forwardRef, type CSSProperties, type HTMLAttributes } from "react";
import { X } from "lucide-react";
import { cn } from "../../lib/cn.js";

interface Props extends Omit<HTMLAttributes<HTMLSpanElement>, "children"> {
  name: string;
  color: string;
  onRemove?: () => void;
  size?: "sm" | "md";
  inherited?: boolean;
  tooltip?: string;
  "data-testid"?: string;
}

/**
 * Generic colored pill used for primitives (prompts, skills, mcp tools, roles).
 * When `inherited` is true, rendered as read-only (muted, no ×, default cursor).
 * Forward refs so drag-and-drop hooks can attach without an extra wrapper div
 * — the wrapper was causing the first chip in a flex-wrap row to stretch.
 */
export const Chip = forwardRef<HTMLSpanElement, Props>(function Chip(
  {
    name,
    color,
    onRemove,
    size = "md",
    inherited,
    tooltip,
    className,
    style,
    "data-testid": testId,
    ...rest
  },
  ref
) {
  const tint = color || "#7a746a";
  const sizeCls =
    size === "sm" ? "h-5 px-1.5 gap-1 text-[11px]" : "h-6 px-2 gap-1.5 text-[12px]";
  const mergedStyle: CSSProperties = { borderColor: `${tint}55`, ...style };
  return (
    <span
      ref={ref}
      data-testid={testId}
      title={tooltip}
      className={cn(
        "inline-flex items-center rounded-full bg-[var(--hover-overlay)] text-[var(--color-text)]",
        "border border-[var(--color-border)]",
        "tabular-nums tracking-tight shrink-0 whitespace-nowrap",
        inherited && "opacity-60 cursor-default",
        sizeCls,
        className
      )}
      style={mergedStyle}
      {...rest}
    >
      <span
        aria-hidden="true"
        className="inline-block h-[6px] w-[6px] rounded-full shrink-0"
        style={{ backgroundColor: tint }}
      />
      <span className="truncate">{name}</span>
      {onRemove && !inherited ? (
        <button
          type="button"
          aria-label={`Remove ${name}`}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          onPointerDown={(e) => e.stopPropagation()}
          className="ml-0.5 inline-flex items-center justify-center h-4 rounded-full text-[var(--color-text-subtle)] hover:text-[var(--color-text)]"
        >
          <X size={10} />
        </button>
      ) : null}
    </span>
  );
});
