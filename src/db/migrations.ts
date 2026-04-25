import type { Database } from "better-sqlite3";
import { readFileSync } from "node:fs";
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
 * and future DBA work, and may be loaded at runtime by their JS counterpart.
 */
export function runMigrations(db: Database): void {
  ensureMigrationsTable(db);
  runMigration(db, "002_add_tag_kind", apply002AddTagKind);
  runMigration(db, "004_refactor_tags_to_typed_entities", apply004RefactorTags);
  runMigration(db, "005_settings", apply005Settings);
  runMigration(db, "006_inheritance", apply006Inheritance);
  runMigration(db, "007_prompt_groups", apply007PromptGroups);
  runMigration(db, "008_tasks_fts", apply008TasksFts);
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
