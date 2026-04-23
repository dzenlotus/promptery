import { useEffect, useMemo, useState } from "react";
import { useSetting } from "../hooks/useSettings.js";
import { AnimatedBackground } from "./AnimatedBackground.js";
import {
  findAnimatedPreset,
  findGradientPreset,
  findSolidPreset,
  type AnimatedPresetId,
} from "./presets.js";

/**
 * Tracks whichever theme is actually resolved to a real value (dark|light),
 * including following the OS preference when `appearance.theme` = system.
 * Mirrors the logic in ThemeProvider but here we only care about the value,
 * not about writing to the DOM.
 */
function useResolvedTheme(): "dark" | "light" {
  const { value: theme } = useSetting("appearance.theme");
  const [systemDark, setSystemDark] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches
  );

  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => setSystemDark(mq.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  if (theme === "dark") return "dark";
  if (theme === "light") return "light";
  return systemDark ? "dark" : "light";
}

function buildFilter(
  brightness: number,
  contrast: number,
  blur: number,
  allowBlur: boolean
): string | undefined {
  const parts: string[] = [];
  if (brightness !== 100) parts.push(`brightness(${brightness}%)`);
  if (contrast !== 100) parts.push(`contrast(${contrast}%)`);
  // Blur on a flat colour or static gradient just wastes GPU and softens
  // the panel edges around the canvas crop — only apply it to animated BGs
  // where there's actual detail to soften.
  if (allowBlur && blur > 0) parts.push(`blur(${blur}px)`);
  return parts.length > 0 ? parts.join(" ") : undefined;
}

export function BackgroundLayer() {
  const { value: type } = useSetting("appearance.background.type");
  const { value: preset } = useSetting("appearance.background.preset");
  const { value: brightness } = useSetting("appearance.background.brightness");
  const { value: contrast } = useSetting("appearance.background.contrast");
  const { value: blur } = useSetting("appearance.background.blur");
  const { value: speed } = useSetting("appearance.background.speed");
  const { value: tint } = useSetting("appearance.background.tint");
  const resolved = useResolvedTheme();

  const filter = useMemo(
    () => buildFilter(brightness, contrast, blur, type === "animated"),
    [brightness, contrast, blur, type]
  );

  // No explicit z-index. `position: fixed` alone creates a stacking context
  // at z-auto, which paints under every sibling that comes later in DOM order
  // (i.e. Canvas content, all portals). Giving this element a numeric z
  // would compete with Radix portals and cause them to disappear behind the
  // canvas.
  const containerClass = "fixed inset-0 pointer-events-none overflow-hidden";

  if (type === "solid") {
    const p = findSolidPreset(preset);
    const color = resolved === "dark" && p.darkColor ? p.darkColor : p.color;
    return (
      <div
        data-testid="background-layer"
        data-bg-type="solid"
        className={containerClass}
        style={{ backgroundColor: color, filter }}
      />
    );
  }

  if (type === "gradient") {
    const p = findGradientPreset(preset);
    const gradient = resolved === "dark" && p.darkGradient ? p.darkGradient : p.gradient;
    return (
      <div
        data-testid="background-layer"
        data-bg-type="gradient"
        className={containerClass}
        style={{ background: gradient, filter }}
      />
    );
  }

  // Animated — fall through to an animated canvas; if the preset string doesn't
  // match a known animation, findAnimatedPreset returns the first one.
  const p = findAnimatedPreset(preset);
  const activePreset: AnimatedPresetId = p.id;

  // Non-default tint is laid on top with a mix-blend so the user can tune the
  // overall colour warmth without rebuilding the animation palette.
  const hasTint = tint && tint.toLowerCase() !== "#000000";

  return (
    <div
      data-testid="background-layer"
      data-bg-type="animated"
      data-bg-preset={activePreset}
      className={containerClass}
      style={{ backgroundColor: "var(--color-bg)", filter }}
    >
      <AnimatedBackground preset={activePreset} speed={speed} />
      {hasTint && (
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{ backgroundColor: tint, mixBlendMode: "overlay", opacity: 0.22 }}
        />
      )}
    </div>
  );
}
