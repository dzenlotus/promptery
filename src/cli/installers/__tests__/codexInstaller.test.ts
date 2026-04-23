import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse as parseToml } from "@iarna/toml";

// Mutable holder so tests can point the installer at a per-test temp file.
const pathHolder: { current: string } = { current: "" };

vi.mock("../paths.js", () => ({
  getCodexConfigPath: () => pathHolder.current,
}));

// Imported after vi.mock so the installer picks up the mocked getCodexConfigPath.
const { installCodex, uninstallCodex, isInstalledInCodex } = await import(
  "../codexInstaller.js"
);

describe("codex TOML installer", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "promptery-codex-installer-"));
    pathHolder.current = join(dir, "config.toml");
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("installs into an empty (non-existent) config", async () => {
    const result = await installCodex();
    expect(result.success).toBe(true);
    expect(result.alreadyInstalled).toBe(false);

    const raw = await readFile(pathHolder.current, "utf-8");
    const parsed = parseToml(raw) as any;
    // Installer writes the absolute npx path (or bare "npx" as a last-resort
    // fallback) so GUI hosts without a shell PATH can still spawn the bridge.
    expect(parsed.mcp_servers.promptery.command).toMatch(/(^|\/)(npx|npx\.cmd)$/);
    expect(parsed.mcp_servers.promptery.args).toContain("@dzenlotus/promptery");
    expect(parsed.mcp_servers.promptery.args).toContain("--agent");
    expect(parsed.mcp_servers.promptery.args).toContain("codex");
  });

  it("preserves existing top-level keys and other mcp_servers entries", async () => {
    await writeFile(
      pathHolder.current,
      [
        'model = "gpt-5"',
        'sandbox_mode = "workspace-write"',
        "",
        "[mcp_servers.other]",
        'command = "other-cmd"',
        "",
      ].join("\n")
    );

    await installCodex();

    const raw = await readFile(pathHolder.current, "utf-8");
    const parsed = parseToml(raw) as any;
    expect(parsed.model).toBe("gpt-5");
    expect(parsed.sandbox_mode).toBe("workspace-write");
    expect(parsed.mcp_servers.other.command).toBe("other-cmd");
    expect(parsed.mcp_servers.promptery).toBeDefined();
  });

  it("reports alreadyInstalled on repeat install", async () => {
    const first = await installCodex();
    expect(first.alreadyInstalled).toBe(false);
    const second = await installCodex();
    expect(second.alreadyInstalled).toBe(true);
  });

  it("rejects invalid TOML without clobbering the file", async () => {
    await writeFile(pathHolder.current, "this is = not = valid = toml\n");
    const result = await installCodex();
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/invalid TOML/i);

    const raw = await readFile(pathHolder.current, "utf-8");
    expect(raw).toBe("this is = not = valid = toml\n");
  });

  it("uninstall removes only Promptery and keeps other sections", async () => {
    await writeFile(
      pathHolder.current,
      [
        'model = "gpt-5"',
        "",
        "[mcp_servers.promptery]",
        'command = "npx"',
        "",
        "[mcp_servers.other]",
        'command = "other"',
        "",
      ].join("\n")
    );

    const result = await uninstallCodex();
    expect(result.success).toBe(true);

    const parsed = parseToml(await readFile(pathHolder.current, "utf-8")) as any;
    expect(parsed.model).toBe("gpt-5");
    expect(parsed.mcp_servers.promptery).toBeUndefined();
    expect(parsed.mcp_servers.other.command).toBe("other");
  });

  it("uninstall drops mcp_servers entirely when it becomes empty", async () => {
    await installCodex();
    const result = await uninstallCodex();
    expect(result.success).toBe(true);
    const raw = await readFile(pathHolder.current, "utf-8");
    expect(raw).toBe("");
  });

  it("uninstall is idempotent when config is missing", async () => {
    const result = await uninstallCodex();
    expect(result.success).toBe(true);
    expect(result.message).toMatch(/not installed|does not exist/i);
  });

  it("isInstalledInCodex reports correct state", async () => {
    const before = await isInstalledInCodex();
    expect(before.installed).toBe(false);
    expect(before.configExists).toBe(false);

    await installCodex();

    const after = await isInstalledInCodex();
    expect(after.installed).toBe(true);
    expect(after.configExists).toBe(true);
  });
});
