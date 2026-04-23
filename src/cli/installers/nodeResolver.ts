import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

/**
 * Resolves the absolute path to the npx binary that sits next to the
 * currently-running Node. Critical for nvm/fnm/volta/asdf users: GUI hosts
 * (Claude Desktop, Claude Code) don't inherit the shell PATH, so a bare
 * `npx` in mcpServers.command fails to spawn — writing a full path side-steps
 * the missing-PATH problem entirely. Falls back to "npx" if nothing absolute
 * can be located, preserving the previous behaviour on plain system Node.
 */
export function resolveNpxPath(): string {
  const nodeDir = dirname(process.execPath);
  const npxName = process.platform === "win32" ? "npx.cmd" : "npx";
  const siblingNpx = join(nodeDir, npxName);
  if (existsSync(siblingNpx)) return siblingNpx;

  const commonPaths =
    process.platform === "win32"
      ? [join(process.env.APPDATA ?? "", "npm", "npx.cmd")]
      : [
          "/usr/local/bin/npx",
          "/opt/homebrew/bin/npx",
          "/usr/bin/npx",
          join(homedir(), ".npm-global", "bin", "npx"),
        ];

  for (const candidate of commonPaths) {
    if (candidate && existsSync(candidate)) return candidate;
  }

  return "npx";
}

/**
 * Heuristic: is the current Node running under a version manager? Used only
 * to decide whether to warn the user that switching Node versions later will
 * stale the absolute path we just wrote into their client config.
 */
export function isManagedNode(): boolean {
  const execPath = process.execPath;
  const indicators = [".nvm/", ".fnm/", ".volta/", ".n/", ".nodenv/", ".asdf/"];
  return indicators.some((i) => execPath.includes(i));
}
