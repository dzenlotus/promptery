import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { parse as parseToml, stringify as stringifyToml } from "@iarna/toml";
import { getCodexConfigPath } from "./paths.js";
import type { InstallResult, StatusResult } from "./jsonInstaller.js";

const SERVER_NAME = "promptery";
const SERVERS_KEY = "mcp_servers";

function buildServerConfig(): { command: string; args: string[] } {
  return {
    command: "npx",
    args: ["-y", "@dzenlotus/promptery", "server", "--agent", "codex"],
  };
}

async function readTomlOrEmpty(
  configPath: string
): Promise<Record<string, unknown>> {
  let content: string;
  try {
    content = await readFile(configPath, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw err;
  }
  if (!content.trim()) return {};
  return parseToml(content) as Record<string, unknown>;
}

export async function installCodex(): Promise<InstallResult> {
  const configPath = getCodexConfigPath();

  try {
    await mkdir(dirname(configPath), { recursive: true });
  } catch (err) {
    return {
      success: false,
      configPath,
      message: `Failed to create directory: ${(err as Error).message}`,
    };
  }

  let data: Record<string, unknown>;
  try {
    data = await readTomlOrEmpty(configPath);
  } catch (err) {
    return {
      success: false,
      configPath,
      message: `Existing Codex config has invalid TOML syntax: ${(err as Error).message}. Please fix it manually.`,
    };
  }

  const existing = data[SERVERS_KEY];
  const servers =
    existing && typeof existing === "object"
      ? { ...(existing as Record<string, unknown>) }
      : {};

  const alreadyInstalled = Object.prototype.hasOwnProperty.call(
    servers,
    SERVER_NAME
  );
  servers[SERVER_NAME] = buildServerConfig();
  data[SERVERS_KEY] = servers;

  try {
    // @iarna/toml.stringify loses comments (known limitation), but keeps all
    // key/value pairs and sections intact, which is the important guarantee.
    const serialized = stringifyToml(
      data as Parameters<typeof stringifyToml>[0]
    );
    await writeFile(configPath, serialized, "utf-8");
  } catch (err) {
    return {
      success: false,
      configPath,
      message: `Failed to write Codex config: ${(err as Error).message}`,
    };
  }

  return {
    success: true,
    configPath,
    alreadyInstalled,
    message: alreadyInstalled
      ? "Updated Promptery in Codex config"
      : "Installed Promptery into Codex",
  };
}

export async function uninstallCodex(): Promise<InstallResult> {
  const configPath = getCodexConfigPath();

  let data: Record<string, unknown>;
  try {
    data = await readTomlOrEmpty(configPath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return {
        success: true,
        configPath,
        message: "Codex config does not exist — nothing to uninstall",
      };
    }
    return {
      success: false,
      configPath,
      message: `Failed to read Codex config: ${(err as Error).message}`,
    };
  }

  const servers = data[SERVERS_KEY] as Record<string, unknown> | undefined;
  if (!servers || !(SERVER_NAME in servers)) {
    return {
      success: true,
      configPath,
      message: "Promptery was not installed in Codex",
    };
  }

  delete servers[SERVER_NAME];
  if (Object.keys(servers).length === 0) {
    delete data[SERVERS_KEY];
  } else {
    data[SERVERS_KEY] = servers;
  }

  try {
    const serialized =
      Object.keys(data).length > 0
        ? stringifyToml(data as Parameters<typeof stringifyToml>[0])
        : "";
    await writeFile(configPath, serialized, "utf-8");
  } catch (err) {
    return {
      success: false,
      configPath,
      message: `Failed to write Codex config: ${(err as Error).message}`,
    };
  }

  return {
    success: true,
    configPath,
    message: "Removed Promptery from Codex",
  };
}

export async function isInstalledInCodex(): Promise<StatusResult> {
  const configPath = getCodexConfigPath();

  let content: string;
  try {
    content = await readFile(configPath, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return { installed: false, configExists: false, configPath };
    }
    return { installed: false, configExists: true, configPath };
  }

  try {
    const data = parseToml(content) as Record<string, unknown>;
    const servers = data[SERVERS_KEY] as Record<string, unknown> | undefined;
    return {
      installed: Boolean(servers && SERVER_NAME in servers),
      configExists: true,
      configPath,
    };
  } catch {
    return { installed: false, configExists: true, configPath };
  }
}
