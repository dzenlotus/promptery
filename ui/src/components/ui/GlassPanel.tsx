import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/cn.js";

interface Props extends HTMLAttributes<HTMLDivElement> {
  /**
   * - "sidebar": translucent surface + blur + gradient hairline. For the left sidebar.
   *   Lets the appearance background peek through while staying readable.
   * - "sub-panel": transparent fill + solid 1px border. For kanban columns etc.
   * - "modal-glass": blurred glass + gradient hairline. For floating modals.
   */
  variant?: "sidebar" | "sub-panel" | "modal-glass";
  radius?: "lg" | "xl" | "2xl";
  children: ReactNode;
}

export function GlassPanel({
  variant = "sidebar",
  radius = "2xl",
  className,
  children,
  ...props
}: Props) {
  const radiusCls = { lg: "rounded-lg", xl: "rounded-xl", "2xl": "rounded-2xl" }[radius];
  const variantCls =
    variant === "sidebar"
      ? "liquid-glass-panel gradient-border shadow-[var(--shadow-md)]"
      : variant === "modal-glass"
        ? "liquid-glass-opaque gradient-border shadow-[var(--shadow-lg)]"
        : "bg-transparent solid-border";
  return (
    <div
      data-testid={(props as { "data-testid"?: string })["data-testid"] ?? "glass-panel"}
      className={cn(variantCls, radiusCls, className)}
      {...props}
    >
      {children}
    </div>
  );
}
