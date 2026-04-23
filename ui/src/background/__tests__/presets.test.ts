import { describe, expect, it } from "vitest";
import {
  ANIMATED_PRESETS,
  GRADIENT_PRESETS,
  SOLID_PRESETS,
  findAnimatedPreset,
  findGradientPreset,
  findSolidPreset,
} from "../presets.js";

function uniq<T extends { id: string }>(arr: readonly T[]): Set<string> {
  return new Set(arr.map((p) => p.id));
}

describe("background presets", () => {
  it("ships at least three solid presets", () => {
    expect(SOLID_PRESETS.length).toBeGreaterThanOrEqual(3);
  });

  it("ships at least three gradient presets", () => {
    expect(GRADIENT_PRESETS.length).toBeGreaterThanOrEqual(3);
  });

  it("ships the three canonical animated presets", () => {
    expect(ANIMATED_PRESETS).toHaveLength(3);
    expect(ANIMATED_PRESETS.map((p) => p.id).sort()).toEqual([
      "aurora",
      "lava",
      "particles",
    ]);
  });

  it("has unique ids inside each preset family", () => {
    expect(uniq(SOLID_PRESETS).size).toBe(SOLID_PRESETS.length);
    expect(uniq(GRADIENT_PRESETS).size).toBe(GRADIENT_PRESETS.length);
    expect(uniq(ANIMATED_PRESETS).size).toBe(ANIMATED_PRESETS.length);
  });

  it("first solid preset is named 'default' and leans on the theme var", () => {
    const p = SOLID_PRESETS[0]!;
    expect(p.id).toBe("default");
    expect(p.color).toContain("--color-bg");
  });

  it("every gradient ships a dark variant", () => {
    for (const p of GRADIENT_PRESETS) {
      expect(p.gradient.length).toBeGreaterThan(0);
      expect(p.darkGradient ?? p.gradient).toBeTruthy();
    }
  });

  it("find helpers fall back to the first preset on unknown id", () => {
    expect(findSolidPreset("does-not-exist").id).toBe(SOLID_PRESETS[0]!.id);
    expect(findGradientPreset("does-not-exist").id).toBe(GRADIENT_PRESETS[0]!.id);
    expect(findAnimatedPreset("does-not-exist").id).toBe(ANIMATED_PRESETS[0]!.id);
  });

  it("find helpers return the exact preset on known id", () => {
    expect(findSolidPreset("warm").id).toBe("warm");
    expect(findGradientPreset("sage").id).toBe("sage");
    expect(findAnimatedPreset("lava").id).toBe("lava");
  });
});
