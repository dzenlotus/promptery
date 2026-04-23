import type { AnimationLifecycle } from "./types.js";

/**
 * Lava lamp — a handful of very large radial gradients that slowly drift and
 * hue-shift across the canvas. The reading is "a multi-colour gradient that
 * slowly rearranges itself", not a cloud of discrete blobs: each blob covers
 * 50–80% of the shortest side, is allowed to overflow the visible area, and
 * picks its hue from a different third of the colour wheel so overlaps stay
 * varied rather than collapsing into one colour.
 *
 * Blend mode is `screen`, which lightens overlaps naturally without the
 * harsh clipping `lighter` produces on saturated colour pairs.
 */
interface Blob {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Radius expressed as a fraction of min(width, height), 0.5–0.8. */
  radiusScale: number;
  /** Anchor hue (0–360); rendered hue drifts ±30° around this. */
  hueBase: number;
  huePhase: number;
}

const BLOB_COUNT = 5;
// Allow blobs to extend this fraction of their radius beyond the canvas so
// the effect looks like a gradient fringe rather than bouncing balls.
const OVERFLOW_FRACTION = 0.4;
// Time progression per ms. Deliberately much lower than aurora so hue drift
// feels like an hour-long sunset, not a colour wheel spinning.
const TIME_STEP = 0.00055;

// "Dusk" palette — a coherent cool→warm-violet slice (215° → 310°) rather
// than the full rainbow. Saturation + lightness + alpha pulled down on top
// of that so the overlap between blobs reads as a calm, dreamy haze rather
// than saturated colour blooms.
const HUE_MIN = 215;
const HUE_SPAN = 95;
const HUE_JITTER = 12;
const HUE_DRIFT = 12;
const SATURATION = 42;
const LIGHTNESS = 44;
const PEAK_ALPHA = 0.42;
const MID_ALPHA = 0.16;

export class LavaAnimation implements AnimationLifecycle {
  private blobs: Blob[] = [];
  private t = 0;

  init(width: number, height: number): void {
    this.t = 0;
    this.blobs = [];
    // Distribute hues across the narrow dusk slice with a small jitter, so
    // the first frame is balanced without the rainbow effect the 0-360°
    // spread was producing.
    for (let i = 0; i < BLOB_COUNT; i++) {
      const jitterX = (Math.random() - 0.5) * 0.2 * width;
      const jitterY = (Math.random() - 0.5) * 0.3 * height;
      this.blobs.push({
        x: ((i + 0.5) / BLOB_COUNT) * width + jitterX,
        y: height * (0.3 + Math.random() * 0.4) + jitterY,
        vx: (Math.random() - 0.5) * 0.12,
        vy: (Math.random() - 0.5) * 0.12,
        radiusScale: 0.5 + Math.random() * 0.3,
        hueBase:
          HUE_MIN + (i / BLOB_COUNT) * HUE_SPAN + (Math.random() - 0.5) * HUE_JITTER,
        huePhase: Math.random() * Math.PI * 2,
      });
    }
  }

  resize(_width: number, _height: number): void {
    // Positions are absolute and velocities carry blobs around naturally —
    // on a resize we let the next bounce pass pull them back into view. Any
    // blobs temporarily off-canvas just fade out at the edges.
  }

  render(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    dt: number,
    speed: number
  ): void {
    this.t += dt * TIME_STEP * speed;
    const minSide = Math.min(width, height);

    // Drift + bounce with an overflow margin so the visible frame is never
    // cleanly framed by a blob — the colour pools always extend past it.
    for (const blob of this.blobs) {
      blob.x += blob.vx * dt * 0.05 * speed;
      blob.y += blob.vy * dt * 0.05 * speed;

      const radius = blob.radiusScale * minSide;
      const margin = radius * OVERFLOW_FRACTION;

      if (blob.x < -margin) {
        blob.x = -margin;
        blob.vx *= -1;
      } else if (blob.x > width + margin) {
        blob.x = width + margin;
        blob.vx *= -1;
      }
      if (blob.y < -margin) {
        blob.y = -margin;
        blob.vy *= -1;
      } else if (blob.y > height + margin) {
        blob.y = height + margin;
        blob.vy *= -1;
      }
    }

    ctx.clearRect(0, 0, width, height);
    ctx.globalCompositeOperation = "screen";
    for (const blob of this.blobs) {
      const radius = blob.radiusScale * minSide;
      const hue =
        (blob.hueBase + Math.sin(this.t + blob.huePhase) * HUE_DRIFT + 360) % 360;
      const gradient = ctx.createRadialGradient(blob.x, blob.y, 0, blob.x, blob.y, radius);
      gradient.addColorStop(0, `hsla(${hue}, ${SATURATION}%, ${LIGHTNESS + 4}%, ${PEAK_ALPHA})`);
      gradient.addColorStop(0.5, `hsla(${hue}, ${SATURATION}%, ${LIGHTNESS}%, ${MID_ALPHA})`);
      gradient.addColorStop(1, `hsla(${hue}, ${SATURATION}%, ${LIGHTNESS - 4}%, 0)`);
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(blob.x, blob.y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";
  }
}
