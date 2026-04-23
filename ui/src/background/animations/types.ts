/**
 * Contract for a pluggable canvas animation.
 *
 * Instances are stateful — init() receives the current canvas size once and
 * may allocate geometry that survives across frames. render() is called on
 * every rAF tick the host component decides to paint; it must not grow its
 * allocations over time (budget once in init). resize() is called when the
 * canvas CSS size changes so the instance can reflow its geometry without
 * being torn down, which keeps motion continuous.
 *
 * `speed` is a unit-free multiplier where 1.0 is the "natural" rate — the
 * host maps the 0–100 user slider into a 0.2–3.0 range and passes that.
 */
export interface AnimationLifecycle {
  init(width: number, height: number): void;
  resize(width: number, height: number): void;
  render(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    dt: number,
    speed: number
  ): void;
  dispose?(): void;
}
