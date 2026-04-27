import { describe, it, expect } from "vitest";
import { countTokens } from "../tokenCount.js";

describe("countTokens (cl100k_base)", () => {
  it("returns 0 for empty / nullish input", () => {
    expect(countTokens("")).toBe(0);
    expect(countTokens(null)).toBe(0);
    expect(countTokens(undefined)).toBe(0);
  });

  it("counts known short strings", () => {
    // "Hello world" tokenises to 2 tokens with cl100k_base. This is a
    // contract test — if it ever drifts, every prompt's stored count would
    // need a re-backfill, so we want a loud failure.
    expect(countTokens("Hello world")).toBe(2);
  });

  it("scales monotonically with input length", () => {
    const small = countTokens("a".repeat(100));
    const big = countTokens("a".repeat(1000));
    expect(small).toBeGreaterThan(0);
    expect(big).toBeGreaterThan(small);
  });

  it("handles content that contains special-token strings literally", () => {
    // No throw — special tokens in user-supplied prompt content shouldn't
    // crash the counter.
    expect(() => countTokens("<|endoftext|> some user instruction")).not.toThrow();
    expect(countTokens("<|endoftext|> some user instruction")).toBeGreaterThan(0);
  });

  it("is deterministic across calls (cached encoder)", () => {
    const a = countTokens("The quick brown fox jumps over the lazy dog");
    const b = countTokens("The quick brown fox jumps over the lazy dog");
    expect(a).toBe(b);
  });
});
