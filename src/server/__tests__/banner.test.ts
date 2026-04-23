import { describe, it, expect, vi } from "vitest";
import { printStartupBanner } from "../banner.js";

describe("printStartupBanner", () => {
  it("prints the banner with URL and version", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    printStartupBanner("http://localhost:4321", "0.1.1");

    const output = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(output).toContain("Promptery");
    expect(output).toContain("v0.1.1");
    expect(output).toContain("http://localhost:4321");

    logSpy.mockRestore();
  });

  it("skips ANSI escapes when stdout is not a TTY", () => {
    // vitest runs with non-TTY stdout by default — so the color() helper's
    // `process.stdout.isTTY` check should short-circuit. This locks in that
    // captured logs / CI output stay clean of escape sequences.
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    printStartupBanner("http://localhost:4321", "0.1.1");

    const output = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
    // eslint-disable-next-line no-control-regex
    expect(output).not.toMatch(/\x1b\[/);

    logSpy.mockRestore();
  });
});
