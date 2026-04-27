import type { Database } from "better-sqlite3";
import { nanoid } from "nanoid";

/**
 * Allowed `kind` values for an agent report. The set is intentionally small
 * so consumers (UI badge, MCP tool descriptions, downstream filters) stay
 * predictable. Validated at the HTTP layer; the DB column is `TEXT NOT NULL`
 * without a CHECK constraint to keep migrations cheap if the vocabulary
 * grows in a future iteration.
 */
export const REPORT_KINDS = [
  "investigation",
  "analysis",
  "plan",
  "summary",
  "review",
  "memo",
] as const;

export type ReportKind = (typeof REPORT_KINDS)[number];

export interface AgentReport {
  id: string;
  task_id: string;
  kind: ReportKind;
  title: string;
  content: string;
  /** Free-form provenance hint — e.g. an MCP `agent_hint` like "claude-desktop".
   *  Null for reports written by a UI-side human author. */
  author: string | null;
  created_at: number;
  updated_at: number;
}

export interface CreateAgentReportInput {
  task_id: string;
  kind: ReportKind;
  title: string;
  content: string;
  author?: string | null;
}

export interface UpdateAgentReportInput {
  kind?: ReportKind;
  title?: string;
  content?: string;
}

export interface ListReportsOptions {
  kind?: ReportKind;
}

export interface ReportSearchHit {
  report: AgentReport;
  task: {
    id: string;
    title: string;
    board_id: string;
  };
}

export const SEARCH_REPORTS_DEFAULT_LIMIT = 20;
export const SEARCH_REPORTS_MAX_LIMIT = 200;

function rowToReport(row: AgentReport): AgentReport {
  // Trust the schema — CHECK is enforced via validators upstream. This helper
  // exists so callers can rely on a stable shape without `as` casts.
  return row;
}

export function listReportsForTask(
  db: Database,
  taskId: string,
  opts: ListReportsOptions = {}
): AgentReport[] {
  if (opts.kind) {
    const rows = db
      .prepare(
        "SELECT * FROM agent_reports WHERE task_id = ? AND kind = ? ORDER BY created_at DESC, id DESC"
      )
      .all(taskId, opts.kind) as AgentReport[];
    return rows.map(rowToReport);
  }
  const rows = db
    .prepare("SELECT * FROM agent_reports WHERE task_id = ? ORDER BY created_at DESC, id DESC")
    .all(taskId) as AgentReport[];
  return rows.map(rowToReport);
}

export function getReport(db: Database, id: string): AgentReport | null {
  const row = db.prepare("SELECT * FROM agent_reports WHERE id = ?").get(id) as
    | AgentReport
    | undefined;
  return row ? rowToReport(row) : null;
}

export function createReport(db: Database, input: CreateAgentReportInput): AgentReport {
  const id = nanoid();
  const now = Date.now();
  db.prepare(
    `INSERT INTO agent_reports (id, task_id, kind, title, content, author, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, input.task_id, input.kind, input.title, input.content, input.author ?? null, now, now);
  return {
    id,
    task_id: input.task_id,
    kind: input.kind,
    title: input.title,
    content: input.content,
    author: input.author ?? null,
    created_at: now,
    updated_at: now,
  };
}

export function updateReport(
  db: Database,
  id: string,
  input: UpdateAgentReportInput
): AgentReport | null {
  const existing = getReport(db, id);
  if (!existing) return null;

  const sets: string[] = [];
  const vals: unknown[] = [];
  if (input.kind !== undefined) {
    sets.push("kind = ?");
    vals.push(input.kind);
  }
  if (input.title !== undefined) {
    sets.push("title = ?");
    vals.push(input.title);
  }
  if (input.content !== undefined) {
    sets.push("content = ?");
    vals.push(input.content);
  }
  if (sets.length === 0) return existing;

  sets.push("updated_at = ?");
  vals.push(Date.now());
  vals.push(id);
  db.prepare(`UPDATE agent_reports SET ${sets.join(", ")} WHERE id = ?`).run(
    ...(vals as [unknown, ...unknown[]])
  );
  return getReport(db, id);
}

export function deleteReport(db: Database, id: string): boolean {
  const result = db.prepare("DELETE FROM agent_reports WHERE id = ?").run(id);
  return result.changes > 0;
}

/**
 * FTS5 escape mirroring `searchTasks` — wrap each whitespace-separated token
 * in quotes (with embedded `"` doubled) so user input like "auth bug" or
 * "fix: hyphen-name" matches as literal phrases rather than being
 * mis-parsed by FTS5's syntax.
 */
function escapeFtsQuery(query: string): string {
  return query
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => `"${token.replace(/"/g, '""')}"`)
    .join(" ");
}

interface SearchRow {
  id: string;
  task_id: string;
  kind: ReportKind;
  title: string;
  content: string;
  author: string | null;
  created_at: number;
  updated_at: number;
  task_title: string;
  task_board_id: string;
}

/**
 * FTS5 search over title + content. Results are joined back to `tasks` so the
 * caller gets task context (id / title / board_id) without a second round
 * trip — the search-results UI uses this to deep-link into the right board.
 *
 * Empty / whitespace-only queries return an empty array (rather than every
 * report ordered by some default) — callers that want "recent" should hit
 * `listReportsForTask` or a future "recent reports" endpoint.
 */
export function searchReports(
  db: Database,
  query: string,
  limit: number = SEARCH_REPORTS_DEFAULT_LIMIT
): ReportSearchHit[] {
  const trimmed = query.trim();
  if (trimmed.length === 0) return [];
  const cappedLimit = Math.min(Math.max(1, limit), SEARCH_REPORTS_MAX_LIMIT);

  const rows = db
    .prepare(
      `SELECT r.id, r.task_id, r.kind, r.title, r.content, r.author,
              r.created_at, r.updated_at,
              t.title AS task_title, t.board_id AS task_board_id
       FROM agent_reports_fts fts
       JOIN agent_reports r ON r.id = fts.report_id
       JOIN tasks t ON t.id = r.task_id
       WHERE agent_reports_fts MATCH ?
       ORDER BY bm25(agent_reports_fts, 1.0, 5.0)
       LIMIT ?`
    )
    .all(escapeFtsQuery(trimmed), cappedLimit) as SearchRow[];

  return rows.map((r) => ({
    report: {
      id: r.id,
      task_id: r.task_id,
      kind: r.kind,
      title: r.title,
      content: r.content,
      author: r.author,
      created_at: r.created_at,
      updated_at: r.updated_at,
    },
    task: {
      id: r.task_id,
      title: r.task_title,
      board_id: r.task_board_id,
    },
  }));
}
