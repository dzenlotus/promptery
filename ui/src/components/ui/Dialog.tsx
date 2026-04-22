import * as RadixDialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../../lib/cn.js";
import { IconButton } from "./IconButton.js";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
  lockOutsideClick?: boolean;
}

/**
 * Centering strategy: Radix's Content covers the full viewport and uses CSS grid
 * place-items-center to position the inner card. This beats top/left-1/2 + translate
 * tricks that can get thrown off by transformed ancestors or content-driven sizing.
 */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = "md",
  lockOutsideClick = true,
}: Props) {
  const width = { sm: "max-w-[420px]", md: "max-w-[560px]", lg: "max-w-[680px]" }[size];
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-40 bg-black/55 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in" />
        <RadixDialog.Content
          onPointerDownOutside={(e) => {
            if (lockOutsideClick) e.preventDefault();
          }}
          className="fixed inset-0 z-50 grid place-items-center p-4 focus:outline-none"
        >
          <div
            className={cn(
              "w-full",
              width,
              "liquid-glass-strong gradient-border rounded-2xl shadow-[0_20px_40px_rgba(0,0,0,0.55)]",
              "max-h-[86vh] grid grid-rows-[auto_1fr_auto]"
            )}
          >
            <div className="grid grid-cols-[1fr_auto] items-start gap-3 px-6 pt-5 pb-3">
              <div className="grid gap-1">
                <RadixDialog.Title className="text-[17px] font-semibold tracking-tight">
                  {title}
                </RadixDialog.Title>
                {description ? (
                  <RadixDialog.Description className="text-[13px] text-[var(--color-text-muted)]">
                    {description}
                  </RadixDialog.Description>
                ) : null}
              </div>
              <RadixDialog.Close asChild>
                <IconButton label="Close">
                  <X size={16} />
                </IconButton>
              </RadixDialog.Close>
            </div>
            <div className="overflow-y-auto scroll-thin px-6 pb-2 min-h-0">{children}</div>
            {footer ? (
              <div className="grid grid-flow-col auto-cols-max justify-end gap-2 px-6 py-4 border-t border-[var(--color-border)]">
                {footer}
              </div>
            ) : null}
          </div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
