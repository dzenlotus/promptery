import {
  installJsonClient,
  uninstallJsonClient,
  isInstalledInJsonClient,
  type InstallResult,
  type StatusResult,
} from "./jsonInstaller.js";
import {
  installCodex,
  uninstallCodex,
  isInstalledInCodex,
} from "./codexInstaller.js";
import {
  getClaudeDesktopConfigPath,
  getClaudeCodeConfigPath,
  getCursorConfigPath,
  getQwenConfigPath,
  getGigacodeConfigPath,
  type CursorScope,
} from "./paths.js";

// -------- Claude Desktop --------

export const installClaudeDesktop = (): Promise<InstallResult> =>
  installJsonClient({
    clientName: "Claude Desktop",
    configPath: getClaudeDesktopConfigPath(),
    agentHint: "claude-desktop",
  });

export const uninstallClaudeDesktop = (): Promise<InstallResult> =>
  uninstallJsonClient({
    clientName: "Claude Desktop",
    configPath: getClaudeDesktopConfigPath(),
    agentHint: "claude-desktop",
  });

export const isInstalledInClaudeDesktop = (): Promise<StatusResult> =>
  isInstalledInJsonClient({
    clientName: "Claude Desktop",
    configPath: getClaudeDesktopConfigPath(),
    agentHint: "claude-desktop",
  });

// -------- Claude Code --------

export const installClaudeCode = (): Promise<InstallResult> =>
  installJsonClient({
    clientName: "Claude Code",
    configPath: getClaudeCodeConfigPath(),
    agentHint: "claude-code",
  });

export const uninstallClaudeCode = (): Promise<InstallResult> =>
  uninstallJsonClient({
    clientName: "Claude Code",
    configPath: getClaudeCodeConfigPath(),
    agentHint: "claude-code",
  });

export const isInstalledInClaudeCode = (): Promise<StatusResult> =>
  isInstalledInJsonClient({
    clientName: "Claude Code",
    configPath: getClaudeCodeConfigPath(),
    agentHint: "claude-code",
  });

// -------- Cursor --------

export const installCursor = (scope: CursorScope = "global"): Promise<InstallResult> =>
  installJsonClient({
    clientName: `Cursor (${scope})`,
    configPath: getCursorConfigPath({ scope }),
    agentHint: "cursor",
  });

export const uninstallCursor = (scope: CursorScope = "global"): Promise<InstallResult> =>
  uninstallJsonClient({
    clientName: `Cursor (${scope})`,
    configPath: getCursorConfigPath({ scope }),
    agentHint: "cursor",
  });

export const isInstalledInCursor = (
  scope: CursorScope = "global"
): Promise<StatusResult> =>
  isInstalledInJsonClient({
    clientName: `Cursor (${scope})`,
    configPath: getCursorConfigPath({ scope }),
    agentHint: "cursor",
  });

// -------- Qwen Code --------

export const installQwen = (): Promise<InstallResult> =>
  installJsonClient({
    clientName: "Qwen Code",
    configPath: getQwenConfigPath(),
    agentHint: "qwen",
  });

export const uninstallQwen = (): Promise<InstallResult> =>
  uninstallJsonClient({
    clientName: "Qwen Code",
    configPath: getQwenConfigPath(),
    agentHint: "qwen",
  });

export const isInstalledInQwen = (): Promise<StatusResult> =>
  isInstalledInJsonClient({
    clientName: "Qwen Code",
    configPath: getQwenConfigPath(),
    agentHint: "qwen",
  });

// -------- GigaCode --------

export const installGigacode = (): Promise<InstallResult> =>
  installJsonClient({
    clientName: "GigaCode",
    configPath: getGigacodeConfigPath(),
    agentHint: "gigacode",
  });

export const uninstallGigacode = (): Promise<InstallResult> =>
  uninstallJsonClient({
    clientName: "GigaCode",
    configPath: getGigacodeConfigPath(),
    agentHint: "gigacode",
  });

export const isInstalledInGigacode = (): Promise<StatusResult> =>
  isInstalledInJsonClient({
    clientName: "GigaCode",
    configPath: getGigacodeConfigPath(),
    agentHint: "gigacode",
  });

// -------- Codex (TOML) --------

export { installCodex, uninstallCodex, isInstalledInCodex };

// -------- Registry --------

export interface ClientDefinition {
  key: string;
  name: string;
  install: () => Promise<InstallResult>;
  uninstall: () => Promise<InstallResult>;
  isInstalled: () => Promise<StatusResult>;
}

export const ALL_CLIENTS: ClientDefinition[] = [
  {
    key: "claude-desktop",
    name: "Claude Desktop",
    install: installClaudeDesktop,
    uninstall: uninstallClaudeDesktop,
    isInstalled: isInstalledInClaudeDesktop,
  },
  {
    key: "claude-code",
    name: "Claude Code",
    install: installClaudeCode,
    uninstall: uninstallClaudeCode,
    isInstalled: isInstalledInClaudeCode,
  },
  {
    key: "cursor",
    name: "Cursor",
    install: () => installCursor("global"),
    uninstall: () => uninstallCursor("global"),
    isInstalled: () => isInstalledInCursor("global"),
  },
  {
    key: "codex",
    name: "Codex",
    install: installCodex,
    uninstall: uninstallCodex,
    isInstalled: isInstalledInCodex,
  },
  {
    key: "qwen",
    name: "Qwen Code",
    install: installQwen,
    uninstall: uninstallQwen,
    isInstalled: isInstalledInQwen,
  },
  {
    key: "gigacode",
    name: "GigaCode",
    install: installGigacode,
    uninstall: uninstallGigacode,
    isInstalled: isInstalledInGigacode,
  },
];
