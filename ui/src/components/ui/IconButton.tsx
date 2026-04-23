import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "../../lib/cn.js";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  label: string;
  size?: "sm" | "md";
  tone?: "muted" | "danger";
}

/**
 * Bare icon — same dim tint as muted text, lights up to primary text on hover.
 * No background chrome. Used for +, kebab, X, edit/delete affordances.
 * Focus visible ring keeps it reachable via keyboard.
 */
export const IconButton = forwardRef<HTMLButtonElement, Props>(function IconButton(
  { children, label, size = "md", tone = "muted", className, ...props },
  ref
) {
  // Height only — width collapses to the icon itself so the hit area is tight
  // around the glyph instead of a square chip.
  const sizeCls = size === "sm" ? "h-6" : "h-7";
  const toneCls =
    tone === "danger"
      ? "text-[var(--color-text-subtle)] hover:text-[var(--color-danger)]"
      : "text-[var(--color-text-subtle)] hover:text-[var(--color-text)]";
  return (
    <button
      ref={ref}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex items-center justify-center rounded-md transition-colors duration-150",
        sizeCls,
        toneCls,
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
});
