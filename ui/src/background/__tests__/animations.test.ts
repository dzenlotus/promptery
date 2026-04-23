import { describe, expect, it, vi } from "vitest";
import { AuroraAnimation } from "../animations/aurora.js";
import { LavaAnimation } from "../animations/lava.js";
import { ParticlesAnimation } from "../animations/particles.js";
import { createAnimation } from "../animations/index.js";

/**
 * Fake 2D context — records every called method so we can assert the
 * animation drew something without pulling in a real canvas. Gradients are
 * returned as opaque objects because the animation code only sets colour
 * stops and never introspects them.
 */
function fakeCtx() {
  const calls: { method: string; args: unknown[] }[] = [];
  const gradient = { addColorStop: vi.fn() };
  const ctx = new Proxy(
    {
      globalCompositeOperation: "source-over" as string,
      fillStyle: "" as string,
      strokeStyle: "" as string,
      lineWidth: 0,
    },
    {
      get(target, prop) {
        if (prop in target) return (target as Record<string, unknown>)[prop as string];
        if (prop === "createLinearGradient" || prop === "createRadialGradient") {
          return () => gradient;
        }
        return (...args: unknown[]) => {
          calls.push({ method: String(prop), args });
        };
      },
      set(target, prop, value) {
        (target as Record<string, unknown>)[prop as string] = value;
        return true;
      },
    }
  );
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls, gradient };
}

describe("aurora animation", () => {
  it("init seeds four waves and render emits clearRect + fills", () => {
    const anim = new AuroraAnimation();
    anim.init(800, 600);

    const { ctx, calls } = fakeCtx();
    anim.render(ctx, 800, 600, 16, 1);

    expect(calls.some((c) => c.method === "clearRect")).toBe(true);
    // 4 waves × 1 fill each.
    expect(calls.filter((c) => c.method === "fill")).toHaveLength(4);
  });

  it("advances t with speed and dt", () => {
    const anim = new AuroraAnimation();
    anim.init(100, 100);
    const { ctx } = fakeCtx();
    // Capture private `t` via two renders — at speed 0 it must not drift,
    // at speed 2 it must drift more than at speed 1.
    const snapshot = (): number => (anim as unknown as { t: number }).t;

    anim.render(ctx, 100, 100, 100, 0);
    expect(snapshot()).toBe(0);

    anim.render(ctx, 100, 100, 100, 1);
    const afterOne = snapshot();

    anim.render(ctx, 100, 100, 100, 2);
    const afterTwo = snapshot();

    expect(afterOne).toBeGreaterThan(0);
    expect(afterTwo - afterOne).toBeGreaterThan(afterOne);
  });
});

describe("lava animation", () => {
  it("init creates a handful of big blobs in a calm dusk palette", () => {
    const anim = new LavaAnimation();
    anim.init(500, 300);
    const blobs = (
      anim as unknown as { blobs: { x: number; radiusScale: number; hueBase: number }[] }
    ).blobs;
    // Loose count check so retuning doesn't constantly break the test.
    expect(blobs.length).toBeGreaterThanOrEqual(4);
    expect(blobs.length).toBeLessThanOrEqual(7);
    for (const b of blobs) {
      expect(b.radiusScale).toBeGreaterThanOrEqual(0.5);
      expect(b.radiusScale).toBeLessThanOrEqual(0.8);
      // Dusk slice is 215-310° with ±12° jitter. Stay well inside ~200-325°
      // so this test fails if someone accidentally widens it back to a
      // full-rainbow distribution.
      expect(b.hueBase).toBeGreaterThan(200);
      expect(b.hueBase).toBeLessThan(325);
    }
  });

  it("resize is safe to call without side-effects on geometry", () => {
    const anim = new LavaAnimation();
    anim.init(1000, 1000);
    const before = JSON.stringify(
      (anim as unknown as { blobs: unknown[] }).blobs
    );
    anim.resize(200, 200);
    const after = JSON.stringify(
      (anim as unknown as { blobs: unknown[] }).blobs
    );
    expect(after).toBe(before);
  });

  it("render paints with screen blend and restores source-over", () => {
    const anim = new LavaAnimation();
    anim.init(400, 400);
    const { ctx, calls } = fakeCtx();
    anim.render(ctx, 400, 400, 16, 1);
    expect(ctx.globalCompositeOperation).toBe("source-over");
    expect(calls.filter((c) => c.method === "fill").length).toBeGreaterThan(0);
  });
});

describe("particles animation", () => {
  it("particle count scales with area, with a floor", () => {
    const anim = new ParticlesAnimation();
    anim.init(100, 100);
    const small = (anim as unknown as { particles: unknown[] }).particles.length;
    anim.init(1920, 1080);
    const big = (anim as unknown as { particles: unknown[] }).particles.length;
    expect(small).toBeGreaterThanOrEqual(20);
    expect(big).toBeGreaterThan(small);
  });

  it("wraps particles that cross screen edges", () => {
    const anim = new ParticlesAnimation();
    anim.init(400, 400);
    const particles = (anim as unknown as {
      particles: { x: number; y: number; vx: number; vy: number }[];
    }).particles;
    particles[0]!.x = -10;
    particles[0]!.y = -10;
    const { ctx } = fakeCtx();
    // One render tick is enough for the wrap pass.
    anim.render(ctx, 400, 400, 16, 1);
    expect(particles[0]!.x).toBeGreaterThanOrEqual(0);
    expect(particles[0]!.y).toBeGreaterThanOrEqual(0);
  });
});

describe("createAnimation factory", () => {
  it("returns the right class per preset id", () => {
    expect(createAnimation("aurora")).toBeInstanceOf(AuroraAnimation);
    expect(createAnimation("lava")).toBeInstanceOf(LavaAnimation);
    expect(createAnimation("particles")).toBeInstanceOf(ParticlesAnimation);
  });
});
