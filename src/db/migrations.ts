import type { Database } from "better-sqlite3";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { nanoid } from "nanoid";
import { DEFAULT_COLUMN_NAMES } from "./queries/boards.js";
import { getBackupsDir } from "../lib/paths.js";

/**
 * Simple file-less migration system.
 *
 * A `_migrations` table tracks which named migrations have been applied. Each
 * migration is a named JS step below that either runs SQL inside a transaction
 * or performs an idempotent normalisation; on first pass it records itself in
 * `_migrations` so subsequent startups skip it.
 *
 * The paired SQL reference files live in `src/db/migrations/*.sql` for docs
 * and future DBA work, and may be loaded at runtime by their JS counterpart.
 */
export interface RunMigrationsOptions {
  /**
   * Default true. Tests set this to false to construct a "pre-FTS" DB
   * snapshot, then run `runFTSMigration(db)` separately and assert backfill.
   */
  includeFTS?: boolean;
}

export function runMigrations(db: Database, opts: RunMigrationsOptions = {}): void {
  const includeFTS = opts.includeFTS ?? true;
  ensureMigrationsTable(db);
  runMigration(db, "002_add_tag_kind", apply002AddTagKind);
  runMigration(db, "004_refactor_tags_to_typed_entities", apply004RefactorTags);
  runMigration(db, "005_settings", apply005Settings);
  runMigration(db, "006_inheritance", apply006Inheritance);
  runMigration(db, "007_prompt_groups", apply007PromptGroups);
  if (includeFTS) {
    runMigration(db, "008_tasks_fts", apply008TasksFts);
  }
  runMigration(db, "009_spaces", apply009Spaces);
  runMigration(db, "010_board_position", apply010BoardPosition);
  runMigration(db, "011_prompt_short_description", apply011PromptShortDescription);
  runMigration(db, "012_task_events", apply012TaskEvents);
  runMigration(db, "013_prompt_tags", apply013PromptTags);
  backfillDefaultColumnsForEmptyBoards(db);
}

/**
 * Test seam: apply only the FTS migration on a DB that was previously
 * initialised with `runMigrations(db, { includeFTS: false })`. Used to
 * verify the backfill step correctly indexes pre-existing rows.
 */
export function runFTSMigration(db: Database): void {
  ensureMigrationsTable(db);
  runMigration(db, "008_tasks_fts", apply008TasksFts);
}

function ensureMigrationsTable(db: Database): void {
  db.exec(
    `CREATE TABLE IF NOT EXISTS _migrations (
       name TEXT PRIMARY KEY,
       applied_at INTEGER NOT NULL
     )`
  );
}

/**
 * Migrations that ALTER existing columns / DROP columns / rebuild tables —
 * the kind whose failure could leave a DB in a partially-migrated state
 * even with the surrounding transaction. We snapshot the DB to
 * `~/.promptery/backups/db-pre-<name>-<ts>.sqlite` immediately before the
 * apply step so the user can `promptery restore <filename>` if anything
 * goes wrong. Pure additive migrations (CREATE TABLE / INSERT) don't need
 * the safety net.
 */
const DESTRUCTIVE_MIGRATIONS = new Set<string>([
  "009_spaces",
  "010_board_position",
]);

function snapshotBeforeMigration(db: Database, name: string): void {
  // The in-memory test DBs (createTestDb) don't expose a real filename, so
  // VACUUM INTO would write to disk for nothing. Skip them — tests have
  // their own per-test isolation.
  // better-sqlite3 stores the path on `db.name`; ":memory:" for in-memory.
  const dbName = (db as unknown as { name?: string }).name;
  if (!dbName || dbName === ":memory:") return;

  try {
    const dir = getBackupsDir();
    mkdirSync(dir, { recursive: true });
    const ts = formatTimestamp(new Date());
    const fullPath = join(dir, `db-pre-${name}-${ts}.sqlite`);
    db.prepare("VACUUM INTO ?").run(fullPath);
    console.log(`[promptery] pre-migration snapshot: ${fullPath}`);
  } catch (err) {
    // Best-effort: log and continue. Refusing to apply the migration
    // because of a backup-path issue would leave the user worse off than
    // proceeding without one.
    console.warn(
      `[promptery] pre-migration snapshot failed (${name}):`,
      err instanceof Error ? err.message : err
    );
  }
}

function formatTimestamp(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function runMigration(db: Database, name: string, apply: (db: Database) => void): void {
  const row = db.prepare("SELECT 1 FROM _migrations WHERE name = ?").get(name);
  if (row) return;

  if (DESTRUCTIVE_MIGRATIONS.has(name)) {
    snapshotBeforeMigration(db, name);
  }

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

function tableExists(db: Database, name: string): boolean {
  const row = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(name);
  return !!row;
}

function apply002AddTagKind(db: Database): void {
  // Tolerate fresh installs where the new schema has already dropped `tags`:
  // 002 then becomes a no-op recorded for bookkeeping only.
  if (!tableExists(db, "tags")) return;

  const cols = db.prepare("PRAGMA table_info(tags)").all() as { name: string }[];
  const hasKind = cols.some((c) => c.name === "kind");

  if (!hasKind) {
    db.exec(
      `ALTER TABLE tags ADD COLUMN kind TEXT NOT NULL DEFAULT 'skill'
         CHECK (kind IN ('role', 'skill', 'prompt', 'mcp'))`
    );
  } else {
    db.exec(
      "UPDATE tags SET kind = 'skill' WHERE kind NOT IN ('role', 'skill', 'prompt', 'mcp')"
    );
  }

  db.exec("CREATE INDEX IF NOT EXISTS idx_tags_kind ON tags(kind)");
}

/**
 * Apply 004: create the four typed primitive tables, add tasks.role_id, and
 * migrate any data sitting in legacy `tags` / `task_tags` into the new shape.
 *
 * Runs inside the transaction supplied by runMigration. Idempotent: if the
 * legacy tables are already gone (fresh install, or a prior run) only the
 * schema-creation half executes.
 */
function apply004RefactorTags(db: Database): void {
  const sqlUrl = new URL("./migrations/004_refactor_tags_to_typed_entities.sql", import.meta.url);
  const sql = readFileSync(sqlUrl, "utf-8");
  db.exec(sql);

  // Add tasks.role_id only if the column is missing (older schemas).
  const taskCols = db.prepare("PRAGMA table_info(tasks)").all() as { name: string }[];
  if (!taskCols.some((c) => c.name === "role_id")) {
    db.exec("ALTER TABLE tasks ADD COLUMN role_id TEXT REFERENCES roles(id) ON DELETE SET NULL");
  }
  db.exec("CREATE INDEX IF NOT EXISTS idx_tasks_role ON tasks(role_id)");

  migrateTagsData(db);
}

/**
 * Move rows from legacy `tags` / `task_tags` into the new typed tables.
 *
 * Strategy: for each old tag, INSERT-OR-IGNORE into the matching typed table
 * preserving id / name / color / timestamps, mapping old `description` to the
 * new `content` field. For each task_tag link, look up the tag's kind and
 * either set tasks.role_id (kind='role') or insert a `direct`-origin row
 * into the matching task_* link table.
 *
 * INSERT OR IGNORE protects against re-runs and the rare case where a fresh
 * primitive with the same name was created in the new schema before the
 * migration completes.
 */
function migrateTagsData(db: Database): void {
  if (!tableExists(db, "tags")) return;

  type LegacyTag = {
    id: string;
    name: string;
    description: string | null;
    color: string | null;
    kind: string;
    created_at: number;
    updated_at: number;
  };

  const legacyTags = db.prepare("SELECT * FROM tags").all() as LegacyTag[];
  const tagsById = new Map<string, LegacyTag>();
  for (const t of legacyTags) tagsById.set(t.id, t);

  const insertByKind: Record<string, string> = {
    prompt: "INSERT OR IGNORE INTO prompts (id, name, content, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    skill: "INSERT OR IGNORE INTO skills (id, name, content, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    mcp: "INSERT OR IGNORE INTO mcp_tools (id, name, content, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    role: "INSERT OR IGNORE INTO roles (id, name, content, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
  };

  for (const tag of legacyTags) {
    const sql = insertByKind[tag.kind];
    if (!sql) continue; // unknown kind — skip rather than fail the whole migration
    db.prepare(sql).run(
      tag.id,
      tag.name,
      tag.description ?? "",
      tag.color ?? "#888",
      tag.created_at,
      tag.updated_at
    );
  }

  if (tableExists(db, "task_tags")) {
    type TaskTagRow = { task_id: string; tag_id: string };
    const links = db.prepare("SELECT * FROM task_tags").all() as TaskTagRow[];

    const insertTaskPrompt = db.prepare(
      "INSERT OR IGNORE INTO task_prompts (task_id, prompt_id, origin, position) VALUES (?, ?, 'direct', 0)"
    );
    const insertTaskSkill = db.prepare(
      "INSERT OR IGNORE INTO task_skills (task_id, skill_id, origin, position) VALUES (?, ?, 'direct', 0)"
    );
    const insertTaskMcp = db.prepare(
      "INSERT OR IGNORE INTO task_mcp_tools (task_id, mcp_tool_id, origin, position) VALUES (?, ?, 'direct', 0)"
    );
    const setRole = db.prepare("UPDATE tasks SET role_id = ? WHERE id = ?");

    for (const link of links) {
      const tag = tagsById.get(link.tag_id);
      if (!tag) continue;
      switch (tag.kind) {
        case "prompt":
          insertTaskPrompt.run(link.task_id, link.tag_id);
          break;
        case "skill":
          insertTaskSkill.run(link.task_id, link.tag_id);
          break;
        case "mcp":
          insertTaskMcp.run(link.task_id, link.tag_id);
          break;
        case "role":
          setRole.run(link.tag_id, link.task_id);
          break;
      }
    }
    db.exec("DROP TABLE task_tags");
  }

  db.exec("DROP TABLE tags");
}

function apply005Settings(db: Database): void {
  const sqlUrl = new URL("./migrations/005_settings.sql", import.meta.url);
  const sql = readFileSync(sqlUrl, "utf-8");
  db.exec(sql);
}

/**
 * Apply 006: add boards.role_id / columns.role_id and the board_prompts /
 * column_prompts link tables. Run only the ALTER TABLE statements that are
 * actually needed — schema.sql already declares the new tables with CREATE
 * IF NOT EXISTS, so on fresh installs the SQL's ALTER TABLE would fail
 * because the column already exists.
 *
 * Mirrors the pattern used in 004: the SQL file is loaded at runtime but
 * guarded statements (`IF NOT EXISTS`, column-presence checks) keep the
 * migration idempotent.
 */
function apply006Inheritance(db: Database): void {
  const boardCols = db.prepare("PRAGMA table_info(boards)").all() as { name: string }[];
  if (!boardCols.some((c) => c.name === "role_id")) {
    db.exec("ALTER TABLE boards ADD COLUMN role_id TEXT REFERENCES roles(id) ON DELETE SET NULL");
  }
  const columnCols = db.prepare("PRAGMA table_info(columns)").all() as { name: string }[];
  if (!columnCols.some((c) => c.name === "role_id")) {
    db.exec(
      "ALTER TABLE columns ADD COLUMN role_id TEXT REFERENCES roles(id) ON DELETE SET NULL"
    );
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS board_prompts (
      board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
      prompt_id TEXT NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
      position INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (board_id, prompt_id)
    );
    CREATE INDEX IF NOT EXISTS idx_board_prompts_board ON board_prompts(board_id, position);
    CREATE TABLE IF NOT EXISTS column_prompts (
      column_id TEXT NOT NULL REFERENCES columns(id) ON DELETE CASCADE,
      prompt_id TEXT NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
      position INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (column_id, prompt_id)
    );
    CREATE INDEX IF NOT EXISTS idx_column_prompts_column ON column_prompts(column_id, position);
    CREATE INDEX IF NOT EXISTS idx_boards_role ON boards(role_id);
    CREATE INDEX IF NOT EXISTS idx_columns_role ON columns(role_id);
  `);
}

function apply007PromptGroups(db: Database): void {
  const sqlUrl = new URL("./migrations/007_prompt_groups.sql", import.meta.url);
  const sql = readFileSync(sqlUrl, "utf-8");
  db.exec(sql);
}

/**
 * Apply 008: stand up the tasks_fts virtual table + sync triggers and backfill
 * existing rows. Schema.sql also declares these on fresh installs (so first-run
 * tests see the FTS table without needing migrations); this step is what
 * upgrades pre-existing DBs and seeds the index from current `tasks` rows.
 *
 * Backfill is idempotent — only inserts rows missing from tasks_fts so a
 * partial prior run plus this migration converge on the same state.
 */
function apply008TasksFts(db: Database): void {
  const sqlUrl = new URL("./migrations/008_tasks_fts.sql", import.meta.url);
  const sql = readFileSync(sqlUrl, "utf-8");
  db.exec(sql);
  db.exec(
    `INSERT INTO tasks_fts(task_id, title, description)
     SELECT id, title, description FROM tasks
     WHERE id NOT IN (SELECT task_id FROM tasks_fts)`
  );
}

/**
 * Apply 009: workspace organisation layer.
 *
 * Three concerns:
 *  - Stand up `spaces` and `space_counters` (idempotent — schema.sql also
 *    declares these for fresh installs).
 *  - Seed exactly one default space, plus an additional Promptery space
 *    when the existing DB has boards whose names start with "Promptery"
 *    (covers the maintainer's personal DB; everyone else lands in the
 *    default space).
 *  - Add `boards.space_id` and populate it; replace `tasks.number` with
 *    `tasks.slug` (minted in `created_at` order, per-space).
 *
 * Schema drift note: on legacy DBs upgraded through this migration the
 * `space_id` and `slug` columns are nullable in the table definition,
 * because SQLite doesn't allow ALTER TABLE … ADD COLUMN NOT NULL without
 * a default. Application code always populates both fields, and the
 * UNIQUE INDEX on slug enforces uniqueness either way. Fresh installs
 * (schema.sql) get the stricter NOT NULL declaration.
 */
function apply009Spaces(db: Database): void {
  const sqlUrl = new URL("./migrations/009_spaces.sql", import.meta.url);
  db.exec(readFileSync(sqlUrl, "utf-8"));

  const now = Date.now();

  // 1. Default space — exactly one row with is_default = 1.
  let defaultSpaceId: string;
  const existingDefault = db
    .prepare("SELECT id FROM spaces WHERE is_default = 1")
    .get() as { id: string } | undefined;
  if (existingDefault) {
    defaultSpaceId = existingDefault.id;
  } else {
    defaultSpaceId = nanoid();
    db.prepare(
      `INSERT INTO spaces (id, name, prefix, is_default, position, created_at, updated_at)
       VALUES (?, 'Default', 'task', 1, 0, ?, ?)`
    ).run(defaultSpaceId, now, now);
    db.prepare(
      "INSERT INTO space_counters (space_id, next_number) VALUES (?, 1)"
    ).run(defaultSpaceId);
  }

  // 2. Promptery space — only when existing data warrants it. Detection by
  // board-name prefix matches the maintainer's setup ("Promptery",
  // "Promptery — Analytics", …) without forcing every other user through
  // a noisy second space they didn't ask for.
  let promptrySpaceId: string | null = null;
  const promptryHits = db
    .prepare("SELECT COUNT(*) AS c FROM boards WHERE name LIKE 'Promptery%'")
    .get() as { c: number };
  if (promptryHits.c > 0) {
    const existing = db
      .prepare("SELECT id FROM spaces WHERE prefix = 'pmt'")
      .get() as { id: string } | undefined;
    if (existing) {
      promptrySpaceId = existing.id;
    } else {
      promptrySpaceId = nanoid();
      db.prepare(
        `INSERT INTO spaces (id, name, prefix, is_default, position, created_at, updated_at)
         VALUES (?, 'Promptery', 'pmt', 0, 1, ?, ?)`
      ).run(promptrySpaceId, now, now);
      db.prepare(
        "INSERT INTO space_counters (space_id, next_number) VALUES (?, 1)"
      ).run(promptrySpaceId);
    }
  }

  // 3. Add `boards.space_id` if missing and populate from the detection
  // above. Promptery boards (by name prefix) → Promptery space; everything
  // else → default space.
  const boardCols = db.prepare("PRAGMA table_info(boards)").all() as {
    name: string;
  }[];
  if (!boardCols.some((c) => c.name === "space_id")) {
    db.exec("ALTER TABLE boards ADD COLUMN space_id TEXT REFERENCES spaces(id)");
    if (promptrySpaceId) {
      db.prepare(
        "UPDATE boards SET space_id = ? WHERE name LIKE 'Promptery%'"
      ).run(promptrySpaceId);
    }
    db.prepare("UPDATE boards SET space_id = ? WHERE space_id IS NULL").run(
      defaultSpaceId
    );
    db.exec("CREATE INDEX IF NOT EXISTS idx_boards_space ON boards(space_id)");
  }

  // 4. Replace `tasks.number` with `tasks.slug`. SQLite 3.35+ supports
  // DROP COLUMN; better-sqlite3 12.x ships with a recent enough engine.
  const taskCols = db.prepare("PRAGMA table_info(tasks)").all() as {
    name: string;
  }[];
  if (!taskCols.some((c) => c.name === "slug")) {
    db.exec("ALTER TABLE tasks ADD COLUMN slug TEXT");

    type LegacyTask = {
      id: string;
      space_id: string;
      created_at: number;
    };
    const legacyTasks = db
      .prepare(
        `SELECT t.id, b.space_id, t.created_at
           FROM tasks t
           JOIN boards b ON b.id = t.board_id
          ORDER BY t.created_at ASC, t.id ASC`
      )
      .all() as LegacyTask[];

    const prefixOf = new Map<string, string>();
    const getPrefix = (sid: string): string => {
      const cached = prefixOf.get(sid);
      if (cached) return cached;
      const row = db
        .prepare("SELECT prefix FROM spaces WHERE id = ?")
        .get(sid) as { prefix: string } | undefined;
      if (!row) {
        throw new Error(`apply009Spaces: space ${sid} missing during slug backfill`);
      }
      prefixOf.set(sid, row.prefix);
      return row.prefix;
    };

    // For each space we track the *next available* slug counter — i.e. the
    // value that would be used for the next mint. After the loop this is
    // exactly what space_counters.next_number should hold.
    const nextAvailable = new Map<string, number>();
    const setSlug = db.prepare("UPDATE tasks SET slug = ? WHERE id = ?");
    for (const t of legacyTasks) {
      const prefix = getPrefix(t.space_id);
      const n = nextAvailable.get(t.space_id) ?? 1;
      nextAvailable.set(t.space_id, n + 1);
      setSlug.run(`${prefix}-${n}`, t.id);
    }

    // Advance per-space counters to the next available value. Spaces with
    // zero tasks aren't in the map and stay at next_number = 1.
    const updateCounter = db.prepare(
      "UPDATE space_counters SET next_number = ? WHERE space_id = ?"
    );
    for (const [sid, n] of nextAvailable.entries()) {
      updateCounter.run(n, sid);
    }

    if (taskCols.some((c) => c.name === "number")) {
      db.exec("ALTER TABLE tasks DROP COLUMN number");
    }
    db.exec(
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_slug_unique ON tasks(slug)"
    );
    db.exec("CREATE INDEX IF NOT EXISTS idx_tasks_slug ON tasks(slug)");
  }
}

/**
 * Apply 010: add `boards.position` and backfill it in created_at order so the
 * pre-migration sort is preserved on first run. The column carries `NOT NULL
 * DEFAULT 0` for fresh inserts; this step sets meaningful per-space values
 * for existing rows.
 */
function apply010BoardPosition(db: Database): void {
  const cols = db.prepare("PRAGMA table_info(boards)").all() as { name: string }[];
  if (!cols.some((c) => c.name === "position")) {
    db.exec("ALTER TABLE boards ADD COLUMN position REAL NOT NULL DEFAULT 0");
  }

  // Backfill once: rows that still carry the default 0 get a fresh sequence.
  // Per-space ordering uses created_at (and id as tiebreaker) so identical
  // creation timestamps stay stable across reruns.
  const needsBackfill = db
    .prepare("SELECT COUNT(*) AS c FROM boards WHERE position = 0")
    .get() as { c: number };
  if (needsBackfill.c > 0) {
    type Row = { id: string; space_id: string; created_at: number };
    const rows = db
      .prepare(
        "SELECT id, space_id, created_at FROM boards ORDER BY space_id, created_at ASC, id ASC"
      )
      .all() as Row[];
    const update = db.prepare("UPDATE boards SET position = ? WHERE id = ?");
    const counter = new Map<string, number>();
    const tx = db.transaction(() => {
      for (const r of rows) {
        const next = (counter.get(r.space_id) ?? 0) + 1;
        counter.set(r.space_id, next);
        update.run(next, r.id);
      }
    });
    tx();
  }

  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_boards_space_position ON boards(space_id, position)"
  );
}

/**
 * Apply 011: add short_description column to prompts table.
 *
 * Idempotent: only runs the ALTER if the column is missing (fresh installs
 * already have it via schema.sql).
 */
function apply011PromptShortDescription(db: Database): void {
  const cols = db.prepare("PRAGMA table_info(prompts)").all() as { name: string }[];
  if (!cols.some((c) => c.name === "short_description")) {
    db.exec("ALTER TABLE prompts ADD COLUMN short_description TEXT");
  }
}

/**
 * Apply 012: stand up the task_events activity-log table + index. Additive
 * only — no backfill is meaningful since pre-existing tasks have no
 * history to recover. Schema.sql also declares this table on fresh
 * installs so first-run tests see it without needing migrations.
 */
function apply012TaskEvents(db: Database): void {
  const sqlUrl = new URL("./migrations/012_task_events.sql", import.meta.url);
  const sql = readFileSync(sqlUrl, "utf-8");
  db.exec(sql);
}

/**
 * Apply 013: stand up the tags + prompt_tags tables. Additive only — no
 * data backfill is meaningful since pre-existing prompts have no tags
 * yet. Schema.sql also declares both tables on fresh installs so first-run
 * tests see them without needing migrations.
 */
function apply013PromptTags(db: Database): void {
  const sqlUrl = new URL("./migrations/013_prompt_tags.sql", import.meta.url);
  const sql = readFileSync(sqlUrl, "utf-8");
  db.exec(sql);
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
