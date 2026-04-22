import type { ReactNode } from "react";

interface Props {
  label: string;
  action?: ReactNode;
  children: ReactNode;
}

/**
 * Shared sidebar section layout — same header height and padding across
 * BoardsList / TagsList so the list start never jumps when the tab switches.
 * Header is h-11 whether or not an `action` is provided.
 */
export function SidebarSection({ label, action, children }: Props) {
  return (
    <div className="grid grid-rows-[auto_1fr] min-h-0 h-full">
      <div className="grid grid-cols-[1fr_auto] items-center gap-2 px-4 h-11">
        <h3 className="text-[10px] uppercase tracking-[0.1em] text-[var(--color-text-subtle)]">
          {label}
        </h3>
        {action ?? <div className="h-6 w-6" />}
      </div>
      <div className="overflow-y-auto scroll-hidden px-1.5 pb-3">{children}</div>
    </div>
  );
}
