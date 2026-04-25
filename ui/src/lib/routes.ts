/** Single source of truth for tab ↔ URL mapping. */
export const ROUTES = {
  home: "/",
  board: (id: string) => `/board/${id}`,
  space: (id: string) => `/s/${id}`,
  /** External-friendly task URL — accepts slug or id, resolves on the
   *  server, and redirects to the task's board. Mirrors `/b/` and `/s/`
   *  in shape per the v0.3.0 spec. */
  task: (idOrSlug: string) => `/t/${idOrSlug}`,
  roles: "/roles",
  prompts: "/prompts",
  skills: "/skills",
  mcp: "/mcp",
  settings: "/settings",
} as const;

export type TabId = "kanban" | "roles" | "prompts" | "skills" | "mcp" | "settings";

/** Tab order drives direction-of-travel animations. */
export const TAB_ORDER: TabId[] = [
  "kanban",
  "roles",
  "prompts",
  "skills",
  "mcp",
  "settings",
];

export function locationToTab(location: string): TabId {
  if (
    location === "/" ||
    location.startsWith("/board/") ||
    location.startsWith("/b/") ||
    location.startsWith("/s/") ||
    location.startsWith("/t/")
  )
    return "kanban";
  if (location.startsWith("/roles")) return "roles";
  if (location.startsWith("/prompts")) return "prompts";
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
    case "prompts":
      return ROUTES.prompts;
    case "skills":
      return ROUTES.skills;
    case "mcp":
      return ROUTES.mcp;
    case "settings":
      return ROUTES.settings;
  }
}
