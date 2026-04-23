import { useEffect } from "react";
import { useLocation } from "wouter";
import { PageLayout } from "../layout/PageLayout.js";
import { SettingsSidebar } from "../components/settings/SettingsSidebar.js";

/** `/settings` with no subroute — land on the first subsection. */
export function SettingsRedirect() {
  const [, setLocation] = useLocation();
  useEffect(() => {
    setLocation("/settings/data", { replace: true });
  }, [setLocation]);
  return (
    <PageLayout
      sidebarContent={<SettingsSidebar />}
      mainContent={<div data-testid="settings-redirect" className="h-full" />}
    />
  );
}
