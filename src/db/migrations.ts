import type { Database } from "better-sqlite3";
import { nanoid } from "nanoid";
import { DEFAULT_COLUMN_NAMES } from "./queries/boards.js";

/**
 * Simple file-less migration system.
 *
 * A `_migrations` table tracks which named migrations have been applied. Each
 * migration is a named JS step below that either runs SQL inside a transaction
 * or performs an idempotent normalisation; on first pass it records itself in
 * `_migrations` so subsequent startups skip it.
 *
 * The paired SQL reference files live in `src/db/migrations/*.sql` for docs
 * and future DBA work, but aren't loaded at runtime — we need mild conditional
 * logic (legacy column detection) that is awkward in pure SQL.
 */
export function runMigrations(db: Database): void {
  ensureMigrationsTable(db);
  runMigration(db, "002_add_tag_kind", apply002AddTagKind);
  backfillDefaultColumnsForEmptyBoards(db);
}

function ensureMigrationsTable(db: Database): void {
  db.exec(
    `CREATE TABLE IF NOT EXISTS _migrations (
       name TEXT PRIMARY KEY,
       applied_at INTEGER NOT NULL
     )`
  );
}

function runMigration(db: Database, name: string, apply: (db: Database) => void): void {
  const row = db.prepare("SELECT 1 FROM _migrations WHERE name = ?").get(name);
  if (row) return;

  const tx = db.transaction(() => {
    apply(db);
    db.prepare("INSERT INTO _migrations (name, applied_at) VALUES (?, ?)").run(
      name,
      Date.now()
    );
  });
  tx();
  console.log(`[promptery] applied migration: ${name}`);
}

function apply002AddTagKind(db: Database): void {
  const cols = db.prepare("PRAGMA table_info(tags)").all() as { name: string }[];
  const hasKind = cols.some((c) => c.name === "kind");

  if (!hasKind) {
    db.exec(
      `ALTER TABLE tags ADD COLUMN kind TEXT NOT NULL DEFAULT 'skill'
         CHECK (kind IN ('role', 'skill', 'prompt', 'mcp'))`
    );
  } else {
    // Legacy installs from an earlier idempotent ALTER (DEFAULT 'tag'). The
    // column is already present but may carry values the new CHECK would
    // reject. Normalise them before any future CHECK enforcement kicks in.
    db.exec(
      "UPDATE tags SET kind = 'skill' WHERE kind NOT IN ('role', 'skill', 'prompt', 'mcp')"
    );
  }

  db.exec("CREATE INDEX IF NOT EXISTS idx_tags_kind ON tags(kind)");
}

/**
 * Historical boards created before createBoard seeded default columns have zero
 * columns. Fill them in so every board lands in the UI with the expected four
 * swim lanes. Intentionally not tracked in _migrations — cheap to repeat.
 */
function backfillDefaultColumnsForEmptyBoards(db: Database): void {
  const boards = db
    .prepare(
      `SELECT b.id FROM boards b
       LEFT JOIN columns c ON c.board_id = b.id
       GROUP BY b.id
       HAVING COUNT(c.id) = 0`
    )
    .all() as { id: string }[];
  if (boards.length === 0) return;

  const insert = db.prepare(
    "INSERT INTO columns (id, board_id, name, position, created_at) VALUES (?, ?, ?, ?, ?)"
  );
  const now = Date.now();
  const tx = db.transaction(() => {
    for (const { id } of boards) {
      DEFAULT_COLUMN_NAMES.forEach((n, idx) => insert.run(nanoid(), id, n, idx, now));
    }
  });
  tx();
}
