import type { Database } from "better-sqlite3";

export interface Setting {
  key: string;
  value: unknown;
  updated_at: number;
}

interface SettingRow {
  key: string;
  value: string;
  updated_at: number;
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

export function getSetting<T = unknown>(db: Database, key: string): T | null {
  const row = db
    .prepare("SELECT value FROM settings WHERE key = ?")
    .get(key) as { value: string } | undefined;
  if (!row) return null;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return null;
  }
}

export function setSetting(db: Database, key: string, value: unknown): Setting {
  const serialized = JSON.stringify(value);
  const now = Date.now();

  db.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).run(key, serialized, now);

  return { key, value, updated_at: now };
}

export function deleteSetting(db: Database, key: string): { ok: true; deleted: boolean } {
  const result = db.prepare("DELETE FROM settings WHERE key = ?").run(key);
  return { ok: true, deleted: result.changes > 0 };
}

export function listSettings(db: Database, prefix?: string): Setting[] {
  const rows = (prefix
    ? db
        .prepare(
          "SELECT key, value, updated_at FROM settings WHERE key LIKE ? ORDER BY key"
        )
        .all(`${prefix}%`)
    : db
        .prepare("SELECT key, value, updated_at FROM settings ORDER BY key")
        .all()) as SettingRow[];

  return rows.map((r) => ({
    key: r.key,
    value: safeParse(r.value),
    updated_at: r.updated_at,
  }));
}

/** Bulk upsert in a single transaction so partial failures roll back cleanly. */
export function setSettings(db: Database, entries: Record<string, unknown>): Setting[] {
  const now = Date.now();
  const stmt = db.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  );

  const results: Setting[] = [];
  const tx = db.transaction(() => {
    for (const [key, value] of Object.entries(entries)) {
      stmt.run(key, JSON.stringify(value), now);
      results.push({ key, value, updated_at: now });
    }
  });
  tx();

  return results;
}
