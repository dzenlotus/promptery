import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/cn.js";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
}

const base =
  "inline-flex items-center justify-center gap-2 rounded-md font-medium select-none " +
  "transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed";

const sizes: Record<Size, string> = {
  sm: "h-7 px-3 text-[12px]",
  md: "h-8 px-3.5 text-[13px]",
};

const variants: Record<Variant, string> = {
  primary:
    "bg-[var(--color-accent)] text-[var(--color-on-accent)] hover:bg-[var(--color-accent-hover)] active:bg-[var(--color-accent-active)]",
  secondary:
    "bg-[var(--hover-overlay)] text-[var(--color-text)] hover:bg-[var(--active-overlay)] active:bg-[var(--active-overlay)]",
  ghost:
    "bg-transparent text-[var(--color-text-muted)] hover:bg-[var(--hover-overlay)] hover:text-[var(--color-text)] active:bg-[var(--active-overlay)]",
  danger:
    "bg-[var(--color-danger-soft)] text-[var(--color-danger)] hover:bg-[var(--color-danger-soft)] hover:text-[var(--color-danger-hover)]",
};

export function Button({
  variant = "secondary",
  size = "md",
  className,
  children,
  ...props
}: Props) {
  return (
    <button className={cn(base, sizes[size], variants[variant], className)} {...props}>
      {children}
    </button>
  );
}
