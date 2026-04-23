import type { ReactNode } from "react";
import { SidebarTabs } from "./SidebarTabs.js";
import { GlassPanel } from "../components/ui/GlassPanel.js";

interface Props {
  children?: ReactNode;
}

export function Sidebar({ children }: Props) {
  return (
    <GlassPanel
      variant="sidebar"
      data-testid="sidebar"
      className="grid grid-rows-[auto_1fr] h-full overflow-hidden"
    >
      <SidebarTabs />
      <div className="min-h-0 overflow-hidden">{children}</div>
    </GlassPanel>
  );
}
