import { describe, it, expect } from "vitest";
import {
  deleteSetting,
  getSetting,
  listSettings,
  setSetting,
  setSettings,
} from "../settings.js";
import { createTestDb } from "./helpers.js";

describe("settings queries", () => {
  it("returns null for a missing key", () => {
    const db = createTestDb();
    expect(getSetting(db, "missing")).toBe(null);
  });

  it("stores and retrieves string values", () => {
    const db = createTestDb();
    setSetting(db, "appearance.theme", "dark");
    expect(getSetting(db, "appearance.theme")).toBe("dark");
  });

  it("stores and retrieves number values", () => {
    const db = createTestDb();
    setSetting(db, "appearance.background.brightness", 80);
    expect(getSetting(db, "appearance.background.brightness")).toBe(80);
  });

  it("stores and retrieves object values", () => {
    const db = createTestDb();
    const obj = { r: 255, g: 128, b: 0 };
    setSetting(db, "appearance.color", obj);
    expect(getSetting(db, "appearance.color")).toEqual(obj);
  });

  it("stores and retrieves boolean and null", () => {
    const db = createTestDb();
    setSetting(db, "flag.enabled", true);
    setSetting(db, "flag.nullable", null);
    expect(getSetting(db, "flag.enabled")).toBe(true);
    expect(getSetting(db, "flag.nullable")).toBe(null);
  });

  it("upserts existing keys", () => {
    const db = createTestDb();
    setSetting(db, "appearance.theme", "dark");
    setSetting(db, "appearance.theme", "light");
    expect(getSetting(db, "appearance.theme")).toBe("light");
  });

  it("advances updated_at on upsert", async () => {
    const db = createTestDb();
    const first = setSetting(db, "k", "a");
    await new Promise((r) => setTimeout(r, 5));
    const second = setSetting(db, "k", "b");
    expect(second.updated_at).toBeGreaterThanOrEqual(first.updated_at);
  });

  it("lists all settings sorted by key", () => {
    const db = createTestDb();
    setSetting(db, "b.one", 1);
    setSetting(db, "a.one", 1);
    const all = listSettings(db);
    expect(all.map((s) => s.key)).toEqual(["a.one", "b.one"]);
  });

  it("filters list by prefix", () => {
    const db = createTestDb();
    setSetting(db, "appearance.theme", "dark");
    setSetting(db, "appearance.blur", 5);
    setSetting(db, "behavior.language", "en");

    const appearance = listSettings(db, "appearance.");
    expect(appearance).toHaveLength(2);
    expect(appearance.map((s) => s.key).sort()).toEqual([
      "appearance.blur",
      "appearance.theme",
    ]);
  });

  it("deletes a setting", () => {
    const db = createTestDb();
    setSetting(db, "k", "v");
    const result = deleteSetting(db, "k");
    expect(result.deleted).toBe(true);
    expect(getSetting(db, "k")).toBe(null);
  });

  it("delete on missing key returns deleted: false", () => {
    const db = createTestDb();
    const result = deleteSetting(db, "nope");
    expect(result).toEqual({ ok: true, deleted: false });
  });

  it("bulk set writes multiple keys atomically", () => {
    const db = createTestDb();
    setSettings(db, { a: 1, b: 2, c: 3 });
    expect(getSetting(db, "a")).toBe(1);
    expect(getSetting(db, "b")).toBe(2);
    expect(getSetting(db, "c")).toBe(3);
  });

  it("bulk set upserts existing keys alongside new ones", () => {
    const db = createTestDb();
    setSetting(db, "existing", "old");
    setSettings(db, { existing: "new", fresh: 42 });
    expect(getSetting(db, "existing")).toBe("new");
    expect(getSetting(db, "fresh")).toBe(42);
  });
});
