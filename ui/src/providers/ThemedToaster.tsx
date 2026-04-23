import { useEffect, useState } from "react";
import { Toaster } from "sonner";
import { useSetting } from "../hooks/useSettings.js";

/**
 * sonner only reads the `theme` prop once on mount in dark/light mode; we
 * re-mount it implicitly by swapping the `theme` prop, which is fine for a
 * top-level widget.
 */
export function ThemedToaster() {
  const { value: theme } = useSetting("appearance.theme");
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia("(prefers-color-scheme: dark)").matches
  );

  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setSystemDark(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  const resolved: "light" | "dark" =
    theme === "system" ? (systemDark ? "dark" : "light") : theme;

  return <Toaster theme={resolved} position="bottom-right" />;
}
