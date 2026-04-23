import { useEffect } from "react";
import { useMeta } from "../hooks/useMeta.js";

const BASE_TITLE = "Promptery";
const DEV_TITLE = `${BASE_TITLE} [DEV]`;

/**
 * Visual disambiguation when two hubs run side-by-side (prod on 4321, dev on
 * 4322 with PROMPTERY_HOME_DIR override). Sets the tab title and renders a
 * fixed badge so production and dev browser windows can't be confused.
 */
export function DevModeIndicator() {
  const { data } = useMeta();
  const devMode = data?.devMode === true;

  useEffect(() => {
    document.title = devMode ? DEV_TITLE : BASE_TITLE;
  }, [devMode]);

  if (!devMode) return null;

  return (
    <div
      data-testid="dev-mode-badge"
      className="pointer-events-none fixed top-2 right-2 z-50 rounded-full bg-amber-500/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-black shadow"
    >
      Dev
    </div>
  );
}
