import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  installJsonClient,
  uninstallJsonClient,
  isInstalledInJsonClient,
  type JsonInstallerConfig,
} from "../jsonInstaller.js";

describe("json installer", () => {
  let dir: string;
  let configPath: string;
  let baseConfig: JsonInstallerConfig;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "promptery-json-installer-"));
    configPath = join(dir, "test-config.json");
    baseConfig = {
      clientName: "Test Client",
      configPath,
      agentHint: "test",
    };
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("creates config file when it does not exist", async () => {
    const result = await installJsonClient(baseConfig);
    expect(result.success).toBe(true);
    expect(result.alreadyInstalled).toBe(false);

    const parsed = JSON.parse(await readFile(configPath, "utf-8"));
    // Installer writes the absolute npx path (or bare "npx" as a last-resort
    // fallback) so GUI hosts without a shell PATH can still spawn the bridge.
    expect(parsed.mcpServers.promptery.command).toMatch(/(^|\/)(npx|npx\.cmd)$/);
    expect(parsed.mcpServers.promptery.args).toContain("@dzenlotus/promptery");
    expect(parsed.mcpServers.promptery.args).toContain("--agent");
    expect(parsed.mcpServers.promptery.args).toContain("test");
  });

  it("creates intermediate directories", async () => {
    const nested = join(dir, "nested", "deeper", "config.json");
    const result = await installJsonClient({ ...baseConfig, configPath: nested });
    expect(result.success).toBe(true);
    const parsed = JSON.parse(await readFile(nested, "utf-8"));
    expect(parsed.mcpServers.promptery).toBeDefined();
  });

  it("preserves other mcpServers entries", async () => {
    await writeFile(
      configPath,
      JSON.stringify({ mcpServers: { other: { command: "other-cmd" } } }, null, 2)
    );

    const result = await installJsonClient(baseConfig);
    expect(result.success).toBe(true);

    const parsed = JSON.parse(await readFile(configPath, "utf-8"));
    expect(parsed.mcpServers.other.command).toBe("other-cmd");
    expect(parsed.mcpServers.promptery).toBeDefined();
  });

  it("preserves unrelated top-level keys (settings.json case)", async () => {
    await writeFile(
      configPath,
      JSON.stringify(
        {
          theme: "dark",
          preferredEditor: "vim",
          mcpServers: { other: { command: "x" } },
          analytics: { enabled: false },
        },
        null,
        2
      )
    );

    await installJsonClient(baseConfig);

    const parsed = JSON.parse(await readFile(configPath, "utf-8"));
    expect(parsed.theme).toBe("dark");
    expect(parsed.preferredEditor).toBe("vim");
    expect(parsed.analytics.enabled).toBe(false);
    expect(parsed.mcpServers.other).toBeDefined();
    expect(parsed.mcpServers.promptery).toBeDefined();
  });

  it("reports alreadyInstalled on second install", async () => {
    const first = await installJsonClient(baseConfig);
    expect(first.alreadyInstalled).toBe(false);

    const second = await installJsonClient(baseConfig);
    expect(second.success).toBe(true);
    expect(second.alreadyInstalled).toBe(true);
  });

  it("rejects invalid JSON without clobbering the file", async () => {
    await writeFile(configPath, "{ not json");

    const result = await installJsonClient(baseConfig);
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/invalid JSON/i);

    const raw = await readFile(configPath, "utf-8");
    expect(raw).toBe("{ not json");
  });

  it("treats empty file as empty object", async () => {
    await writeFile(configPath, "");

    const result = await installJsonClient(baseConfig);
    expect(result.success).toBe(true);

    const parsed = JSON.parse(await readFile(configPath, "utf-8"));
    expect(parsed.mcpServers.promptery).toBeDefined();
  });

  it("uninstall removes only Promptery, keeps others", async () => {
    await writeFile(
      configPath,
      JSON.stringify(
        {
          theme: "dark",
          mcpServers: {
            promptery: { command: "npx", args: ["@dzenlotus/promptery"] },
            other: { command: "other" },
          },
        },
        null,
        2
      )
    );

    const result = await uninstallJsonClient(baseConfig);
    expect(result.success).toBe(true);

    const parsed = JSON.parse(await readFile(configPath, "utf-8"));
    expect(parsed.theme).toBe("dark");
    expect(parsed.mcpServers.promptery).toBeUndefined();
    expect(parsed.mcpServers.other).toBeDefined();
  });

  it("uninstall is idempotent when config is missing", async () => {
    const result = await uninstallJsonClient(baseConfig);
    expect(result.success).toBe(true);
    expect(result.message).toMatch(/not installed|does not exist/i);
  });

  it("uninstall is a no-op when promptery is not present", async () => {
    await writeFile(
      configPath,
      JSON.stringify({ mcpServers: { other: { command: "x" } } })
    );
    const result = await uninstallJsonClient(baseConfig);
    expect(result.success).toBe(true);
    expect(result.message).toMatch(/not installed/i);
  });

  it("isInstalledInJsonClient reports the right state", async () => {
    const before = await isInstalledInJsonClient(baseConfig);
    expect(before.installed).toBe(false);
    expect(before.configExists).toBe(false);

    await installJsonClient(baseConfig);

    const after = await isInstalledInJsonClient(baseConfig);
    expect(after.installed).toBe(true);
    expect(after.configExists).toBe(true);
  });

  it("isInstalledInJsonClient treats invalid JSON as configExists only", async () => {
    await writeFile(configPath, "{ not json");
    const status = await isInstalledInJsonClient(baseConfig);
    expect(status.installed).toBe(false);
    expect(status.configExists).toBe(true);
  });
});
