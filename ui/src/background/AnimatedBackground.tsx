import { useEffect, useRef } from "react";
import { createAnimation, type AnimationLifecycle } from "./animations/index.js";
import type { AnimatedPresetId } from "./presets.js";

interface Props {
  preset: AnimatedPresetId;
  /** 0–100 slider value; mapped to a 0.2×–3.0× rate multiplier inside. */
  speed: number;
}

// Cap dt so a backgrounded tab that wakes up doesn't advance animation state
// by several seconds in a single frame — that makes particles warp in ways
// the user reads as a bug.
const MAX_DT_MS = 50;
// Cap DPR: on 3x retina, doubling both axes + every frame fill is expensive
// and indistinguishable from 2x at this effect quality.
const MAX_DPR = 2;

function mapSpeed(slider: number): number {
  // Slider range (0–100) → a gentle non-linear curve that feels natural:
  // 0 → slowest usable (0.2x); 50 → 1x; 100 → 3x.
  const clamped = Math.max(0, Math.min(100, slider));
  return 0.2 + (clamped / 50) ** 1.2;
}

export function AnimatedBackground({ preset, speed }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const instanceRef = useRef<AnimationLifecycle | null>(null);
  // Mutable refs so the rAF closure sees fresh values without being re-created.
  const speedRef = useRef(mapSpeed(speed));
  const visibleRef = useRef(!document.hidden);
  const reducedMotionRef = useRef(
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );

  // Keep speed ref in sync without re-running the main setup effect.
  useEffect(() => {
    speedRef.current = mapSpeed(speed);
  }, [speed]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const instance = createAnimation(preset);
    instanceRef.current = instance;

    let rafId = 0;
    let lastTime = performance.now();

    const applySize = () => {
      const rect = canvas.getBoundingClientRect();
      const cssWidth = Math.max(1, Math.round(rect.width));
      const cssHeight = Math.max(1, Math.round(rect.height));
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);

      const pixelWidth = Math.max(1, Math.round(cssWidth * dpr));
      const pixelHeight = Math.max(1, Math.round(cssHeight * dpr));
      if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
      if (canvas.height !== pixelHeight) canvas.height = pixelHeight;

      // setTransform rather than scale() so successive resize() calls don't
      // accumulate the DPR scale into the matrix and smear the image.
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      return { cssWidth, cssHeight };
    };

    const { cssWidth: initW, cssHeight: initH } = applySize();
    instance.init(initW, initH);

    const ro = new ResizeObserver(() => {
      const { cssWidth, cssHeight } = applySize();
      instance.resize(cssWidth, cssHeight);
    });
    ro.observe(canvas);

    const loop = (now: number) => {
      rafId = window.requestAnimationFrame(loop);
      const dt = Math.min(now - lastTime, MAX_DT_MS);
      lastTime = now;

      if (!visibleRef.current || reducedMotionRef.current) return;

      const rect = canvas.getBoundingClientRect();
      instance.render(
        ctx,
        Math.max(1, Math.round(rect.width)),
        Math.max(1, Math.round(rect.height)),
        dt,
        speedRef.current
      );
    };
    rafId = window.requestAnimationFrame(loop);

    const onVisibility = () => {
      visibleRef.current = !document.hidden;
      // Reset the delta clock so the first post-wake frame doesn't advance
      // state by the entire time the tab was hidden.
      if (visibleRef.current) lastTime = performance.now();
    };
    document.addEventListener("visibilitychange", onVisibility);

    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onMotion = () => {
      reducedMotionRef.current = mq.matches;
    };
    mq.addEventListener("change", onMotion);

    return () => {
      window.cancelAnimationFrame(rafId);
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      mq.removeEventListener("change", onMotion);
      instance.dispose?.();
      instanceRef.current = null;
    };
  }, [preset]);

  return (
    <canvas
      ref={canvasRef}
      data-testid="animated-canvas"
      className="absolute inset-0 w-full h-full block"
      style={{ pointerEvents: "none" }}
    />
  );
}
