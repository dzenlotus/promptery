import { AuroraAnimation } from "./aurora.js";
import { LavaAnimation } from "./lava.js";
import { ParticlesAnimation } from "./particles.js";
import type { AnimationLifecycle } from "./types.js";
import type { AnimatedPresetId } from "../presets.js";

export type { AnimationLifecycle } from "./types.js";

const FACTORIES: Record<AnimatedPresetId, () => AnimationLifecycle> = {
  aurora: () => new AuroraAnimation(),
  lava: () => new LavaAnimation(),
  particles: () => new ParticlesAnimation(),
};

export function createAnimation(preset: AnimatedPresetId): AnimationLifecycle {
  const factory = FACTORIES[preset];
  return factory();
}
