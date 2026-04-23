export interface SolidPreset {
  id: string;
  name: string;
  /** CSS color accepted verbatim — hex, rgb(), or `var(--...)` for theme-linked defaults. */
  color: string;
  darkColor?: string;
}

export interface GradientPreset {
  id: string;
  name: string;
  gradient: string;
  darkGradient?: string;
}

export type AnimatedPresetId = "aurora" | "lava" | "particles";
export interface AnimatedPreset {
  id: AnimatedPresetId;
  name: string;
  /** Lightweight static preview swatch — used in the preset grid tile. */
  previewGradient: string;
}

export const SOLID_PRESETS: SolidPreset[] = [
  // "default" leans on the active theme's --color-bg so it always matches.
  { id: "default", name: "Default", color: "var(--color-bg)" },
  { id: "slate", name: "Slate", color: "#e2e8f0", darkColor: "#0f172a" },
  { id: "warm", name: "Warm", color: "#fef3c7", darkColor: "#1a1410" },
  { id: "cool", name: "Cool", color: "#dbeafe", darkColor: "#0a1020" },
  { id: "sand", name: "Sand", color: "#f5ebdc", darkColor: "#1c1510" },
];

// Muted gradients. The previous round had stops so close in value/hue that
// they read as flat solids; this round keeps the low-chroma mood but widens
// the tonal span (~0.3 in lightness, 30-60° in hue) so the direction of
// travel is visible. Ember set the target; the others now match its
// contrast budget.
export const GRADIENT_PRESETS: GradientPreset[] = [
  {
    // Warm pink → cool slate blue; diagonal dusk sky.
    id: "dusk",
    name: "Dusk",
    gradient: "linear-gradient(135deg, #ecd8de 0%, #a9a4bf 50%, #566485 100%)",
    darkGradient: "linear-gradient(135deg, #231a28 0%, #2a2a45 50%, #2d3f5c 100%)",
  },
  {
    // Pale cream-green → deep moss.
    id: "sage",
    name: "Sage",
    gradient: "linear-gradient(135deg, #e9ecd4 0%, #a5c098 50%, #546d55 100%)",
    darkGradient: "linear-gradient(135deg, #181e14 0%, #223322 50%, #304a38 100%)",
  },
  {
    // Pale sand → warm clay.
    id: "dune",
    name: "Dune",
    gradient: "linear-gradient(135deg, #f3ead5 0%, #d2b987 50%, #8a7142 100%)",
    darkGradient: "linear-gradient(135deg, #20180f 0%, #332718 50%, #4c3a20 100%)",
  },
  {
    // Pale sky → deep slate blue.
    id: "mist",
    name: "Mist",
    gradient: "linear-gradient(135deg, #e4ecf1 0%, #a5b7c6 50%, #55667a 100%)",
    darkGradient: "linear-gradient(135deg, #131820 0%, #1d2c3a 50%, #2a4559 100%)",
  },
  // Kept verbatim — user-approved reference for the rest of the palette.
  {
    id: "ember",
    name: "Ember",
    gradient: "linear-gradient(135deg, #e4d2c4 0%, #c7a08a 50%, #a37660 100%)",
    darkGradient: "linear-gradient(135deg, #1c1411 0%, #2a1d16 50%, #38281c 100%)",
  },
];

export const ANIMATED_PRESETS: AnimatedPreset[] = [
  {
    id: "aurora",
    name: "Aurora",
    previewGradient: "linear-gradient(135deg, #4c1d95, #1e3a8a, #064e3b)",
  },
  {
    id: "lava",
    name: "Lava lamp",
    previewGradient: "linear-gradient(135deg, #500724, #7c2d12, #a16207)",
  },
  {
    id: "particles",
    name: "Particles",
    previewGradient: "linear-gradient(135deg, #18181b 0%, #3f3f46 100%)",
  },
];

export function findSolidPreset(id: string): SolidPreset {
  return SOLID_PRESETS.find((p) => p.id === id) ?? SOLID_PRESETS[0]!;
}
export function findGradientPreset(id: string): GradientPreset {
  return GRADIENT_PRESETS.find((p) => p.id === id) ?? GRADIENT_PRESETS[0]!;
}
export function findAnimatedPreset(id: string): AnimatedPreset {
  return ANIMATED_PRESETS.find((p) => p.id === id) ?? ANIMATED_PRESETS[0]!;
}
