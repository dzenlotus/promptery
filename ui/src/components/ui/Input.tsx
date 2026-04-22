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
          "transition-[border-color,box-shadow] duration-150 outline-none",
          "hover:border-[var(--color-border-strong)]",
          "focus:border-[var(--color-accent)] focus:shadow-[0_0_0_3px_var(--color-accent-ring)]",
          className
        )}
        {...props}
      />
    );
  }
);
