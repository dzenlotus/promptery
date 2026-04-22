import { motion } from "framer-motion";
import { useLocation } from "wouter";
import { LayoutGrid, Plug, Settings, Sparkles, FileText, UserRound } from "lucide-react";
import { hrefForTab, locationToTab, type TabId } from "../lib/routes.js";
import { cn } from "../lib/cn.js";

const TABS: { id: TabId; icon: typeof LayoutGrid; label: string }[] = [
  { id: "kanban", icon: LayoutGrid, label: "Kanban" },
  { id: "roles", icon: UserRound, label: "Roles" },
  { id: "tags", icon: FileText, label: "Prompts" },
  { id: "skills", icon: Sparkles, label: "Skills" },
  { id: "mcp", icon: Plug, label: "MCP" },
  { id: "settings", icon: Settings, label: "Settings" },
];

function TabButton({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: typeof LayoutGrid;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "relative h-9 inline-flex items-center justify-center rounded-full transition-colors duration-200",
        "focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_var(--color-accent-ring)]",
        active
          ? "px-3 text-[var(--color-text)]"
          : "w-9 text-[var(--color-text-subtle)] hover:text-[var(--color-text)]"
      )}
    >
      {active && (
        <motion.div
          layoutId="tab-pill"
          className="absolute inset-0 rounded-full bg-[var(--hover-overlay)]"
          transition={{ type: "spring", stiffness: 420, damping: 34 }}
        />
      )}
      <span className="relative inline-flex items-center gap-1.5">
        <Icon size={15} strokeWidth={2} />
        {active ? (
          <span className="text-[12px] font-medium tracking-tight">{label}</span>
        ) : null}
      </span>
    </button>
  );
}

export function SidebarTabs() {
  const [location, setLocation] = useLocation();
  const activeTab = locationToTab(location);

  return (
    <div className="flex items-center justify-between gap-1 px-3 pt-3 pb-2">
      {TABS.map((t) => (
        <TabButton
          key={t.id}
          icon={t.icon}
          label={t.label}
          active={activeTab === t.id}
          onClick={() => setLocation(hrefForTab(t.id))}
        />
      ))}
    </div>
  );
}
