import * as RadixTooltip from "@radix-ui/react-tooltip";
import type { ReactNode } from "react";
import { cn } from "../../lib/cn.js";

export const TooltipProvider = RadixTooltip.Provider;

interface Props {
  content: string;
  children: ReactNode;
  /** Delay in ms before showing. Default: 300. */
  delayDuration?: number;
  side?: "top" | "bottom" | "left" | "right";
}

/**
 * Thin wrapper over Radix Tooltip. Renders nothing when `content` is empty.
 * The Provider must be mounted above (see App.tsx / TooltipProvider export).
 */
export function Tooltip({ content, children, delayDuration = 300, side = "top" }: Props) {
  if (!content) return <>{children}</>;
  return (
    <RadixTooltip.Root delayDuration={delayDuration}>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content
          side={side}
          sideOffset={6}
          className={cn(
            "z-50 max-w-[260px] rounded-md px-2.5 py-1.5",
            "liquid-glass-strong gradient-border shadow-[var(--shadow-lg)]",
            "text-[12px] leading-snug text-[var(--color-text)]",
            "animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95"
          )}
        >
          {content}
          <RadixTooltip.Arrow className="fill-[var(--color-surface)]" />
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );
}
