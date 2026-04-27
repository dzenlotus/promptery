import { Database, Hash, Palette } from "lucide-react";
import { useLocation } from "wouter";
import { SidebarSection } from "../../layout/SidebarSection.js";
import { cn } from "../../lib/cn.js";

interface Item {
  href: string;
  label: string;
  icon: typeof Database;
  testId: string;
}

const ITEMS: Item[] = [
  { href: "/settings/data", label: "Data", icon: Database, testId: "settings-nav-data" },
  { href: "/settings/appearance", label: "Appearance", icon: Palette, testId: "settings-nav-appearance" },
  { href: "/settings/tokens", label: "Tokens", icon: Hash, testId: "settings-nav-tokens" },
];

export function SettingsSidebar() {
  const [location, setLocation] = useLocation();

  return (
    <SidebarSection label="Settings">
      <nav className="space-y-0.5">
        {ITEMS.map(({ href, label, icon: Icon, testId }) => {
          const active = location === href || location.startsWith(`${href}/`);
          return (
            <button
              key={href}
              type="button"
              data-testid={testId}
              onClick={() => setLocation(href)}
              className={cn(
                "w-full grid grid-cols-[16px_1fr] items-center gap-2 h-9 px-3 rounded-md text-left text-[13px] tracking-tight transition-colors duration-150",
                active
                  ? "bg-[var(--color-accent-soft)] text-[var(--color-text)]"
                  : "hover:bg-[var(--hover-overlay)] text-[var(--color-text)]"
              )}
            >
              <Icon
                size={14}
                className={
                  active
                    ? "text-[var(--color-accent)]"
                    : "text-[var(--color-text-subtle)]"
                }
              />
              <span className="truncate">{label}</span>
            </button>
          );
        })}
      </nav>
    </SidebarSection>
  );
}
