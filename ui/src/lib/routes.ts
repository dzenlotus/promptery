/** Single source of truth for tab ↔ URL mapping. */
export const ROUTES = {
  home: "/",
  board: (id: string) => `/board/${id}`,
  roles: "/roles",
  tags: "/tags",
  skills: "/skills",
  mcp: "/mcp",
  settings: "/settings",
} as const;

export type TabId = "kanban" | "roles" | "tags" | "skills" | "mcp" | "settings";

/** Tab order drives direction-of-travel animations. */
export const TAB_ORDER: TabId[] = ["kanban", "roles", "tags", "skills", "mcp", "settings"];

export function locationToTab(location: string): TabId {
  if (location === "/" || location.startsWith("/board/")) return "kanban";
  if (location.startsWith("/roles")) return "roles";
  if (location.startsWith("/tags")) return "tags";
  if (location.startsWith("/skills")) return "skills";
  if (location.startsWith("/mcp")) return "mcp";
  if (location.startsWith("/settings")) return "settings";
  return "kanban";
}

export function tabIndex(tab: TabId): number {
  return TAB_ORDER.indexOf(tab);
}

export function hrefForTab(tab: TabId): string {
  switch (tab) {
    case "kanban":
      return ROUTES.home;
    case "roles":
      return ROUTES.roles;
    case "tags":
      return ROUTES.tags;
    case "skills":
      return ROUTES.skills;
    case "mcp":
      return ROUTES.mcp;
    case "settings":
      return ROUTES.settings;
  }
}
