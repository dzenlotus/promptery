import { describe, it, expect, afterEach } from "vitest";
import {
  writeHubLock,
  readHubLock,
  clearHubLock,
  isHubAlive,
  isProcessAlive,
} from "../discovery.js";

afterEach(async () => {
  await clearHubLock();
});

describe("hub discovery", () => {
  it("writes and reads the lock file", async () => {
    await writeHubLock({
      pid: 12345,
      port: 4321,
      started_at: 1,
      version: "0.0.0",
    });
    const info = await readHubLock();
    expect(info).not.toBeNull();
    expect(info!.pid).toBe(12345);
    expect(info!.port).toBe(4321);
  });

  it("returns null when no lock file exists", async () => {
    await clearHubLock();
    const info = await readHubLock();
    expect(info).toBeNull();
  });

  it("isProcessAlive: true for own pid, false for bogus pid", () => {
    expect(isProcessAlive(process.pid)).toBe(true);
    // pid 0 is reserved on every platform; 2^31-1 is vanishingly unlikely
    // to be in use. Using Math.floor so we pass an integer.
    expect(isProcessAlive(Math.floor(2 ** 31 - 1))).toBe(false);
  });

  it("isHubAlive: false when no hub on port", async () => {
    const alive = await isHubAlive(
      { pid: process.pid, port: 1, started_at: 0, version: "0" },
      500
    );
    expect(alive).toBe(false);
  });
});
