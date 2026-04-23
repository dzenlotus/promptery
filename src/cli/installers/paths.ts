import { homedir } from "node:os";
import { join } from "node:path";

export function getClaudeDesktopConfigPath(): string {
  const home = homedir();
  if (process.platform === "darwin") {
    return join(
      home,
      "Library",
      "Application Support",
      "Claude",
      "claude_desktop_config.json"
    );
  }
  if (process.platform === "win32") {
    const appData = process.env.APPDATA ?? join(home, "AppData", "Roaming");
    return join(appData, "Claude", "claude_desktop_config.json");
  }
  return join(home, ".config", "Claude", "claude_desktop_config.json");
}

export function getClaudeCodeConfigPath(): string {
  return join(homedir(), ".claude.json");
}

export type CursorScope = "global" | "project";

export function getCursorConfigPath(options?: { scope?: CursorScope }): string {
  const scope = options?.scope ?? "global";
  if (scope === "project") {
    return join(process.cwd(), ".cursor", "mcp.json");
  }
  return join(homedir(), ".cursor", "mcp.json");
}

export function getCodexConfigPath(): string {
  return join(homedir(), ".codex", "config.toml");
}

export function getQwenConfigPath(): string {
  return join(homedir(), ".qwen", "settings.json");
}

export function getGigacodeConfigPath(): string {
  return join(homedir(), ".gigacode", "settings.json");
}
