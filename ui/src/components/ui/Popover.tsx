import * as RadixPopover from "@radix-ui/react-popover";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "../../lib/cn.js";

export const Popover = RadixPopover.Root;
export const PopoverTrigger = RadixPopover.Trigger;
export const PopoverAnchor = RadixPopover.Anchor;

type ContentProps = ComponentPropsWithoutRef<typeof RadixPopover.Content> & {
  children: ReactNode;
};

export function PopoverContent({
  children,
  className,
  align = "start",
  sideOffset = 6,
  ...props
}: ContentProps) {
  return (
    <RadixPopover.Portal>
      <RadixPopover.Content
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "liquid-glass-strong gradient-border rounded-xl p-1 shadow-[var(--shadow-lg)] z-50",
          "min-w-[var(--radix-popover-trigger-width)] max-h-[360px]",
          "animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out",
          className
        )}
        {...props}
      >
        {children}
      </RadixPopover.Content>
    </RadixPopover.Portal>
  );
}
