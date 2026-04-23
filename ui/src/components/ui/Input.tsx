import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "../../lib/cn.js";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          "w-full h-9 px-3 rounded-md",
          "bg-[var(--color-surface-raised)] text-[var(--color-text)]",
          "border border-[var(--color-border)]",
          "placeholder:text-[var(--color-text-subtle)]",
          "outline-none",
          className
        )}
        {...props}
      />
    );
  }
);
