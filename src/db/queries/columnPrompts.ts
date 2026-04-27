import type { Database } from "better-sqlite3";
import type { Prompt } from "./prompts.js";

export function listColumnPrompts(db: Database, columnId: string): Prompt[] {
  const rows = db
    .prepare(
      `SELECT p.* FROM prompts p
       JOIN column_prompts cp ON cp.prompt_id = p.id
       WHERE cp.column_id = ?
       ORDER BY cp.position ASC, p.name ASC`
    )
    .all(columnId) as Array<Omit<Prompt, "token_count"> & { token_count: number | null }>;
  return rows.map((r) => ({ ...r, token_count: r.token_count ?? 0 }));
}

/**
 * Replace the whole prompt set for a column in one transaction. Same
 * semantics as setBoardPrompts — idempotent, order defined by input list,
 * missing prompt ids surface as FK errors.
 */
export function setColumnPrompts(
  db: Database,
  columnId: string,
  promptIds: string[]
): Prompt[] {
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM column_prompts WHERE column_id = ?").run(columnId);
    const insert = db.prepare(
      "INSERT INTO column_prompts (column_id, prompt_id, position) VALUES (?, ?, ?)"
    );
    promptIds.forEach((promptId, i) => insert.run(columnId, promptId, i));
  });
  tx();
  return listColumnPrompts(db, columnId);
}
