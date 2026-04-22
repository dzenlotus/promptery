import * as RadixDropdown from "@radix-ui/react-dropdown-menu";
import type { ReactNode } from "react";
import { cn } from "../../lib/cn.js";

export const DropdownMenu = RadixDropdown.Root;
export const DropdownTrigger = RadixDropdown.Trigger;
export const DropdownPortal = RadixDropdown.Portal;

interface ContentProps {
  children: ReactNode;
  align?: "start" | "center" | "end";
  sideOffset?: number;
  className?: string;
}

export function DropdownContent({
  children,
  align = "end",
  sideOffset = 6,
  className,
}: ContentProps) {
  return (
    <RadixDropdown.Portal>
      <RadixDropdown.Content
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "min-w-[180px] rounded-xl liquid-glass-strong gradient-border p-1.5",
          "shadow-[var(--shadow-lg)]",
          "animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out",
          className
        )}
      >
        {children}
      </RadixDropdown.Content>
    </RadixDropdown.Portal>
  );
}

interface ItemProps {
  children: ReactNode;
  onSelect?: () => void;
  danger?: boolean;
  disabled?: boolean;
}

export function DropdownItem({ children, onSelect, danger, disabled }: ItemProps) {
  return (
    <RadixDropdown.Item
      disabled={disabled}
      onSelect={onSelect}
      className={cn(
        "flex items-center gap-2 h-8 px-2.5 rounded-md text-[13px]",
        "cursor-pointer select-none outline-none transition-colors",
        danger
          ? "text-[var(--color-danger)] data-[highlighted]:bg-[var(--color-danger-soft)]"
          : "text-[var(--color-text)] data-[highlighted]:bg-[var(--hover-overlay)]",
        "data-[disabled]:opacity-40 data-[disabled]:pointer-events-none"
      )}
    >
      {children}
    </RadixDropdown.Item>
  );
}

export function DropdownSeparator() {
  return <RadixDropdown.Separator className="my-1 h-px bg-[var(--color-border)]" />;
}
