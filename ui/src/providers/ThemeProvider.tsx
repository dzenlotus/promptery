import { useEffect, type ReactNode } from "react";
import { useSetting } from "../hooks/useSettings.js";

type Theme = "dark" | "light" | "system";

function effectiveTheme(t: Theme): "dark" | "light" {
  if (t === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return t;
}

/**
 * Reflects the `appearance.theme` setting onto <html data-theme>. Tracks the
 * OS-level preference when theme = "system" and flips live if the user
 * toggles it in their system settings.
 *
 * Applies once synchronously in a layout effect before any paint so there's
 * no brief flash of the wrong theme. Also mirrors the value into
 * `<meta name="color-scheme">` so native scrollbars and form controls follow.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const { value: theme } = useSetting("appearance.theme");

  useEffect(() => {
    const apply = () => {
      const resolved = effectiveTheme(theme);
      document.documentElement.setAttribute("data-theme", resolved);
      const metaTag = document.querySelector('meta[name="color-scheme"]');
      if (metaTag instanceof HTMLMetaElement) metaTag.content = resolved;
    };

    apply();

    if (theme === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      const handler = () => apply();
      // Safari ≤13 fallback to addListener; modern browsers use addEventListener.
      mq.addEventListener("change", handler);
      return () => mq.removeEventListener("change", handler);
    }
  }, [theme]);

  return <>{children}</>;
}
