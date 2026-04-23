import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // ui/**/*.test.ts is limited to pure-logic modules (presets, animation
    // state). Anything that needs DOM or React should add its own jsdom/rtl
    // setup — not yet pulled in.
    include: ["src/**/*.test.ts", "ui/src/**/*.test.ts"],
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
  },
});
