import { nanoid } from "nanoid";
import type { Database } from "better-sqlite3";

export interface MakeBoardOptions {
  id?: string;
  name?: string;
  role_id?: string | null;
}

export interface MadeBoard {
  id: string;
  name: string;
  role_id: string | null;
}

export function makeBoard(db: Database, opts: MakeBoardOptions = {}): MadeBoard {
  const id = opts.id ?? nanoid();
  const name = opts.name ?? `Board ${id.slice(0, 6)}`;
  const role_id = opts.role_id ?? null;
  const now = Date.now();
  db.prepare(
    "INSERT INTO boards (id, name, role_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
  ).run(id, name, role_id, now, now);
  return { id, name, role_id };
}

export interface MakeColumnOptions {
  id?: string;
  name?: string;
  board_id: string;
  position?: number;
  role_id?: string | null;
}

export interface MadeColumn {
  id: string;
  name: string;
  board_id: string;
  position: number;
  role_id: string | null;
}

export function makeColumn(db: Database, opts: MakeColumnOptions): MadeColumn {
  const id = opts.id ?? nanoid();
  const name = opts.name ?? `Column ${id.slice(0, 6)}`;
  const position = opts.position ?? 0;
  const role_id = opts.role_id ?? null;
  db.prepare(
    "INSERT INTO columns (id, board_id, name, position, role_id, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(id, opts.board_id, name, position, role_id, Date.now());
  return { id, name, board_id: opts.board_id, position, role_id };
}

export interface MakeTaskOptions {
  id?: string;
  number?: number;
  title?: string;
  description?: string;
  /** Required — `board_id` is derived from the column lookup. */
  column_id: string;
  position?: number;
  role_id?: string | null;
  /**
   * Override created_at/updated_at when ordering or backfill semantics need
   * to be deterministic. Default = `Date.now()`.
   */
  created_at?: number;
  updated_at?: number;
}

export interface MadeTask {
  id: string;
  board_id: string;
  column_id: string;
  number: number;
  title: string;
  description: string;
  position: number;
  role_id: string | null;
  created_at: number;
  updated_at: number;
}

export function makeTask(db: Database, opts: MakeTaskOptions): MadeTask {
  // tasks.board_id is NOT NULL on the schema; deriving it from column_id
  // keeps the factory call sites short and matches how the spec expects
  // the helper to be invoked.
  const colRow = db
    .prepare("SELECT board_id FROM columns WHERE id = ?")
    .get(opts.column_id) as { board_id: string } | undefined;
  if (!colRow) {
    throw new Error(`makeTask: column ${opts.column_id} not found`);
  }

  const id = opts.id ?? nanoid();
  const number = opts.number ?? 1;
  const title = opts.title ?? `Task ${id.slice(0, 6)}`;
  const description = opts.description ?? "";
  const position = opts.position ?? 0;
  const role_id = opts.role_id ?? null;
  const now = Date.now();
  const created_at = opts.created_at ?? now;
  const updated_at = opts.updated_at ?? created_at;

  db.prepare(
    `INSERT INTO tasks
       (id, board_id, column_id, number, title, description, position, role_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    colRow.board_id,
    opts.column_id,
    number,
    title,
    description,
    position,
    role_id,
    created_at,
    updated_at
  );

  return {
    id,
    board_id: colRow.board_id,
    column_id: opts.column_id,
    number,
    title,
    description,
    position,
    role_id,
    created_at,
    updated_at,
  };
}

export interface MakeRoleOptions {
  id?: string;
  name?: string;
  content?: string;
}

export interface MadeRole {
  id: string;
  name: string;
  content: string;
}

export function makeRole(db: Database, opts: MakeRoleOptions = {}): MadeRole {
  const id = opts.id ?? nanoid();
  const name = opts.name ?? `Role ${id.slice(0, 6)}`;
  const content = opts.content ?? "";
  const now = Date.now();
  db.prepare(
    "INSERT INTO roles (id, name, content, color, created_at, updated_at) VALUES (?, ?, ?, '#888', ?, ?)"
  ).run(id, name, content, now, now);
  return { id, name, content };
}

export interface SeedWorkspaceResult {
  boards: MadeBoard[];
  columns: MadeColumn[];
  tasks: MadeTask[];
  roles: MadeRole[];
}

/**
 * Realistic workspace fixture — 2 boards, 4 columns, 6 tasks, 2 roles. Tests
 * that depend on counts assume *exactly* this shape; if you change content,
 * update the dependent assertions in `tasks-search.unit.test.ts`.
 */
export function seedWorkspace(db: Database): SeedWorkspaceResult {
  const role1 = makeRole(db, { name: "frontend" });
  const role2 = makeRole(db, { name: "backend" });

  const board1 = makeBoard(db, { name: "Project Alpha" });
  const board2 = makeBoard(db, { name: "Project Beta", role_id: role2.id });

  const col1a = makeColumn(db, { board_id: board1.id, name: "Backlog", position: 0 });
  const col1b = makeColumn(db, { board_id: board1.id, name: "In Progress", position: 1 });
  const col1c = makeColumn(db, { board_id: board1.id, name: "Done", position: 2 });
  const col2a = makeColumn(db, { board_id: board2.id, name: "Ideas", position: 0 });

  const tasks: MadeTask[] = [
    makeTask(db, {
      column_id: col1a.id,
      number: 1,
      title: "Fix cmdk crash on first keystroke",
      description: "CommandItem needs unique value prop",
      role_id: role1.id,
      position: 0,
    }),
    makeTask(db, {
      column_id: col1a.id,
      number: 2,
      title: "Add token counter to bundles",
      description: "Display token count next to prompt names",
      role_id: role1.id,
      position: 1,
    }),
    makeTask(db, {
      column_id: col1b.id,
      number: 3,
      title: "Refactor resolver for inheritance",
      description: "Resolver in src/db/resolvers/taskContext.ts has duplicate prompts",
      role_id: role2.id,
      position: 0,
    }),
    makeTask(db, {
      column_id: col1c.id,
      number: 4,
      title: "Hide scrollbars across UI",
      description: "Match the liquid glass aesthetic",
      role_id: role1.id,
      position: 0,
    }),
    makeTask(db, {
      column_id: col2a.id,
      number: 5,
      title: "Pixel office visualization",
      description: "Each agent as a sprite at a desk with name labels",
      position: 0,
    }),
    makeTask(db, {
      column_id: col2a.id,
      number: 6,
      title: "Парольный менеджер на Tauri",
      description: "Тестируем кириллицу и unicode normalization",
      position: 1,
    }),
  ];

  return {
    boards: [board1, board2],
    columns: [col1a, col1b, col1c, col2a],
    tasks,
    roles: [role1, role2],
  };
}
