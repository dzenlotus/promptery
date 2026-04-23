import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { isManagedNode, resolveNpxPath } from "../nodeResolver.js";

describe("resolveNpxPath", () => {
  it("returns a non-empty string", () => {
    expect(resolveNpxPath()).toBeTruthy();
  });

  it("returns an existing file when the path is absolute", () => {
    const resolved = resolveNpxPath();
    if (isAbsolute(resolved)) {
      expect(existsSync(resolved)).toBe(true);
    }
  });

  it("prefers the npx sibling of the current node binary", () => {
    const nodeDir = dirname(process.execPath);
    const siblingName = process.platform === "win32" ? "npx.cmd" : "npx";
    const expected = join(nodeDir, siblingName);
    if (existsSync(expected)) {
      expect(resolveNpxPath()).toBe(expected);
    }
  });
});

describe("isManagedNode", () => {
  it("returns a boolean", () => {
    expect(typeof isManagedNode()).toBe("boolean");
  });
});
