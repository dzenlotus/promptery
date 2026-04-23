import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { resolveNpxPath } from "./nodeResolver.js";

export interface JsonInstallerConfig {
  /** Human-friendly name used in messages, e.g. "Claude Desktop". */
  clientName: string;
  /** Absolute path to the client's config file. */
  configPath: string;
  /** Key under which servers are listed. Defaults to "mcpServers". */
  serversKey?: string;
  /** Server name inside the servers map. Defaults to "promptery". */
  serverName?: string;
  /** Agent hint forwarded to the bridge for diagnostics. */
  agentHint: string;
}

export interface InstallResult {
  success: boolean;
  configPath: string;
  message: string;
  alreadyInstalled?: boolean;
}

export interface StatusResult {
  installed: boolean;
  configExists: boolean;
  configPath: string;
}

const DEFAULT_SERVERS_KEY = "mcpServers";
const DEFAULT_SERVER_NAME = "promptery";

function buildServerConfig(agentHint: string): {
  command: string;
  args: string[];
} {
  return {
    command: resolveNpxPath(),
    args: ["-y", "@dzenlotus/promptery", "server", "--agent", agentHint],
  };
}

/**
 * Reads JSON if the file exists, returns {} if ENOENT, and throws on
 * malformed JSON so callers can surface a clear error to the user instead of
 * silently overwriting their config.
 */
async function readJsonOrEmpty(configPath: string): Promise<Record<string, unknown>> {
  let content: string;
  try {
    content = await readFile(configPath, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw err;
  }
  if (!content.trim()) return {};
  return JSON.parse(content) as Record<string, unknown>;
}

export async function installJsonClient(
  config: JsonInstallerConfig
): Promise<InstallResult> {
  const serversKey = config.serversKey ?? DEFAULT_SERVERS_KEY;
  const serverName = config.serverName ?? DEFAULT_SERVER_NAME;

  try {
    await mkdir(dirname(config.configPath), { recursive: true });
  } catch (err) {
    return {
      success: false,
      configPath: config.configPath,
      message: `Failed to create directory: ${(err as Error).message}`,
    };
  }

  let data: Record<string, unknown>;
  try {
    data = await readJsonOrEmpty(config.configPath);
  } catch (err) {
    return {
      success: false,
      configPath: config.configPath,
      message: `Existing config is invalid JSON: ${(err as Error).message}. Please fix it manually.`,
    };
  }

  const existingServers =
    (data[serversKey] as Record<string, unknown> | undefined) ?? {};
  const servers =
    typeof existingServers === "object" && existingServers !== null
      ? { ...existingServers }
      : {};

  const alreadyInstalled = Object.prototype.hasOwnProperty.call(
    servers,
    serverName
  );
  servers[serverName] = buildServerConfig(config.agentHint);
  data[serversKey] = servers;

  try {
    await writeFile(
      config.configPath,
      JSON.stringify(data, null, 2) + "\n",
      "utf-8"
    );
  } catch (err) {
    return {
      success: false,
      configPath: config.configPath,
      message: `Failed to write config: ${(err as Error).message}`,
    };
  }

  return {
    success: true,
    configPath: config.configPath,
    alreadyInstalled,
    message: alreadyInstalled
      ? `Updated Promptery in ${config.clientName} config`
      : `Installed Promptery into ${config.clientName}`,
  };
}

export async function uninstallJsonClient(
  config: JsonInstallerConfig
): Promise<InstallResult> {
  const serversKey = config.serversKey ?? DEFAULT_SERVERS_KEY;
  const serverName = config.serverName ?? DEFAULT_SERVER_NAME;

  let data: Record<string, unknown>;
  try {
    data = await readJsonOrEmpty(config.configPath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return {
        success: true,
        configPath: config.configPath,
        message: `${config.clientName} config does not exist — nothing to uninstall`,
      };
    }
    return {
      success: false,
      configPath: config.configPath,
      message: `Failed to read config: ${(err as Error).message}`,
    };
  }

  const servers = data[serversKey];
  if (
    !servers ||
    typeof servers !== "object" ||
    !(serverName in (servers as Record<string, unknown>))
  ) {
    return {
      success: true,
      configPath: config.configPath,
      message: `Promptery was not installed in ${config.clientName}`,
    };
  }

  delete (servers as Record<string, unknown>)[serverName];

  try {
    await writeFile(
      config.configPath,
      JSON.stringify(data, null, 2) + "\n",
      "utf-8"
    );
  } catch (err) {
    return {
      success: false,
      configPath: config.configPath,
      message: `Failed to write config: ${(err as Error).message}`,
    };
  }

  return {
    success: true,
    configPath: config.configPath,
    message: `Removed Promptery from ${config.clientName}`,
  };
}

export async function isInstalledInJsonClient(
  config: JsonInstallerConfig
): Promise<StatusResult> {
  const serversKey = config.serversKey ?? DEFAULT_SERVERS_KEY;
  const serverName = config.serverName ?? DEFAULT_SERVER_NAME;

  let content: string;
  try {
    content = await readFile(config.configPath, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return {
        installed: false,
        configExists: false,
        configPath: config.configPath,
      };
    }
    return {
      installed: false,
      configExists: true,
      configPath: config.configPath,
    };
  }

  try {
    const data = JSON.parse(content) as Record<string, unknown>;
    const servers = data[serversKey] as Record<string, unknown> | undefined;
    return {
      installed: Boolean(servers && serverName in servers),
      configExists: true,
      configPath: config.configPath,
    };
  } catch {
    // malformed JSON is treated as "present but indeterminate" so status
    // shows the client as detected without overstating install status.
    return {
      installed: false,
      configExists: true,
      configPath: config.configPath,
    };
  }
}
