import * as RadixPopover from "@radix-ui/react-popover";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "../../lib/cn.js";

export const Popover = RadixPopover.Root;
export const PopoverTrigger = RadixPopover.Trigger;
export const PopoverAnchor = RadixPopover.Anchor;

type ContentProps = ComponentPropsWithoutRef<typeof RadixPopover.Content> & {
  children: ReactNode;
  "data-testid"?: string;
};

export function PopoverContent({
  children,
  className,
  align = "start",
  sideOffset = 6,
  "data-testid": testId = "popover",
  ...props
}: ContentProps) {
  return (
    <RadixPopover.Portal>
      <RadixPopover.Content
        align={align}
        sideOffset={sideOffset}
        data-testid={testId}
        className={cn(
          // Radius formula: inner items are rounded-md (10px) + Command.List
          // sits inside p-1 (4px) → outer = 10 + 4 = 14px = rounded-lg.
          "liquid-glass-strong gradient-border rounded-lg p-1 shadow-[var(--shadow-lg)] z-50",
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
