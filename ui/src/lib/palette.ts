/**
 * Deterministic palette for auto-assigning distinct colors to named entities
 * (tags, prompt groups, roles, etc.).
 *
 * The palette uses accessible, vivid hues that contrast well against both
 * light and dark surfaces. The FNV-1a hash ensures two users / two browsers
 * always see the same color for the same name, with no runtime dependencies.
 */

export const ENTITY_PALETTE: readonly string[] = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#84cc16",
  "#22c55e",
  "#14b8a6",
  "#06b6d4",
  "#3b82f6",
  "#8b5cf6",
  "#d946ef",
  "#ec4899",
  "#f43f5e",
] as const;

/**
 * Returns a palette index for `name` using an FNV-1a 32-bit hash.
 * The result is deterministic: identical inputs always produce identical
 * outputs regardless of environment or JavaScript engine.
 */
export function paletteIndexForName(name: string): number {
  // FNV-1a 32-bit
  let h = 0x811c9dc5;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return Math.abs(h) % ENTITY_PALETTE.length;
}

/**
 * Returns the palette hex color that corresponds deterministically to `name`.
 * Use this wherever a color is not yet user-specified.
 */
export function paletteColorForName(name: string): string {
  return ENTITY_PALETTE[paletteIndexForName(name)];
}
