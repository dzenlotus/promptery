import type { AnimationLifecycle } from "./types.js";

/**
 * Aurora — four soft vertical bands sweeping across the canvas with drifting
 * phase and hue. Renders with one linear gradient per band and no shaders.
 *
 * Palette is deliberately muted: a narrow "cool dusk" slice of the wheel
 * (steel blue → muted violet), mid-range saturation, lowered opacity. The
 * earlier version used a 240-360° span at 70%/55% which read as neon ribbons
 * — too loud for a permanent workspace background.
 */
interface Wave {
  amp: number;
  freq: number;
  phase: number;
  hue: number;
}

const WAVE_COUNT = 4;
// Cool dusk slice — steel blue → muted violet. Avoids the magenta end of
// the wheel that was making the previous aurora read as neon.
const HUE_MIN = 200;
const HUE_SPAN = 80;
const SATURATION = 45;
const LIGHTNESS_PEAK = 50;
const LIGHTNESS_FOOT = 38;
// Alpha at the brightest point of the band. Lower = calmer ambient glow.
const PEAK_ALPHA = 0.13;

export class AuroraAnimation implements AnimationLifecycle {
  private t = 0;
  private waves: Wave[] = [];

  init(_width: number, _height: number): void {
    this.t = 0;
    this.waves = [];
    for (let i = 0; i < WAVE_COUNT; i++) {
      this.waves.push({
        amp: 60 + Math.random() * 80,
        freq: 0.002 + Math.random() * 0.003,
        phase: Math.random() * Math.PI * 2,
        hue: HUE_MIN + Math.random() * HUE_SPAN,
      });
    }
  }

  resize(_width: number, _height: number): void {
    // Pure function of input coordinates; nothing to reflow.
  }

  render(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    dt: number,
    speed: number
  ): void {
    this.t += dt * 0.001 * speed;

    ctx.clearRect(0, 0, width, height);

    const step = 12;
    for (const wave of this.waves) {
      const gradient = ctx.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, `hsla(${wave.hue}, ${SATURATION}%, ${LIGHTNESS_PEAK}%, 0)`);
      gradient.addColorStop(
        0.5,
        `hsla(${wave.hue}, ${SATURATION}%, ${LIGHTNESS_PEAK}%, ${PEAK_ALPHA})`
      );
      gradient.addColorStop(1, `hsla(${wave.hue}, ${SATURATION}%, ${LIGHTNESS_FOOT}%, 0)`);
      ctx.fillStyle = gradient;

      ctx.beginPath();
      ctx.moveTo(0, height);
      for (let x = 0; x <= width; x += step) {
        const y =
          height * 0.35 +
          Math.sin(x * wave.freq + this.t + wave.phase) * wave.amp +
          Math.sin(x * wave.freq * 1.7 + this.t * 1.3 + wave.phase) * wave.amp * 0.3;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(width, height);
      ctx.closePath();
      ctx.fill();
    }
  }
}
