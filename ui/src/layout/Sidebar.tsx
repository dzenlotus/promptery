import { useLocation } from "wouter";
import { SidebarTabs } from "./SidebarTabs.js";
import { BoardsList } from "../components/boards/BoardsList.js";
import { TagsList } from "../components/tags/TagsList.js";
import { GlassPanel } from "../components/ui/GlassPanel.js";
import { locationToTab } from "../lib/routes.js";

function SidebarContent() {
  const [location] = useLocation();
  const tab = locationToTab(location);
  switch (tab) {
    case "kanban":
      return <BoardsList />;
    case "roles":
      return <TagsList kind="role" label="Roles" />;
    case "tags":
      return <TagsList kind="prompt" label="Prompts" />;
    case "skills":
      return <TagsList kind="skill" label="Skills" />;
    case "mcp":
      return <TagsList kind="mcp" label="MCP" />;
    case "settings":
      return <div className="h-full" />;
  }
}

export function Sidebar() {
  return (
    <GlassPanel variant="sidebar" className="grid grid-rows-[auto_1fr] h-full overflow-hidden">
      <SidebarTabs />
      <div className="min-h-0 overflow-hidden">
        <SidebarContent />
      </div>
    </GlassPanel>
  );
}
