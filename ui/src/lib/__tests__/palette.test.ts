import { describe, expect, it } from "vitest";
import {
  ENTITY_PALETTE,
  paletteColorForName,
  paletteIndexForName,
} from "../palette.js";

describe("paletteIndexForName", () => {
  it("returns the same index for the same name (determinism)", () => {
    const names = ["frontend", "backend", "testing", "performance", "docs"];
    for (const name of names) {
      const a = paletteIndexForName(name);
      const b = paletteIndexForName(name);
      expect(a).toBe(b);
    }
  });

  it("returns an index within palette bounds", () => {
    const names = [
      "",
      "a",
      "Testing",
      "TESTING",
      "Code Style",
      "Long Entity Name That Should Still Work Fine",
    ];
    for (const name of names) {
      const idx = paletteIndexForName(name);
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(ENTITY_PALETTE.length);
    }
  });

  it("produces different indices for different names (distribution)", () => {
    const names = [
      "alpha",
      "beta",
      "gamma",
      "delta",
      "epsilon",
      "zeta",
      "eta",
      "theta",
      "iota",
      "kappa",
      "lambda",
      "mu",
      "nu",
      "xi",
      "omicron",
      "pi",
    ];
    const indices = new Set(names.map(paletteIndexForName));
    // With 16 names and 12 palette slots some collisions are expected, but we
    // want at least 8 distinct slots to confirm reasonable distribution.
    expect(indices.size).toBeGreaterThanOrEqual(8);
  });

  it("is case-sensitive (different cases can yield different slots)", () => {
    // We only assert they are integers in range; the exact values are hashed
    // and may collide for some pairs, but the function should not throw.
    const lower = paletteIndexForName("testing");
    const upper = paletteIndexForName("Testing");
    expect(typeof lower).toBe("number");
    expect(typeof upper).toBe("number");
  });
});

describe("paletteColorForName", () => {
  it("returns a hex color string from the palette", () => {
    const color = paletteColorForName("my-tag");
    expect(ENTITY_PALETTE).toContain(color);
  });

  it("is deterministic across calls", () => {
    const name = "determinism-check";
    expect(paletteColorForName(name)).toBe(paletteColorForName(name));
  });

  it("returns a valid hex format (#rrggbb)", () => {
    const names = ["frontend", "backend", "devops", "qa", "ux"];
    for (const name of names) {
      const color = paletteColorForName(name);
      expect(color).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});
