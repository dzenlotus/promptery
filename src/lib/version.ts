import { readFileSync } from "node:fs";

let cached: string | null = null;

export function getAppVersion(): string {
  if (cached) return cached;
  try {
    const pkg = JSON.parse(
      readFileSync(new URL("../../package.json", import.meta.url), "utf-8")
    ) as { version: string };
    cached = pkg.version;
  } catch {
    cached = "0.0.0";
  }
  return cached;
}
