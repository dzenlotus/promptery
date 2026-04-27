import type { Database } from "better-sqlite3";
import type { Prompt } from "./prompts.js";

/**
 * Read the ordered list of prompts directly attached to a board. Ties in
 * position fall back to name so the order is stable across reloads even
 * before anyone manually positions rows.
 */
export function listBoardPrompts(db: Database, boardId: string): Prompt[] {
  const rows = db
    .prepare(
      `SELECT p.* FROM prompts p
       JOIN board_prompts bp ON bp.prompt_id = p.id
       WHERE bp.board_id = ?
       ORDER BY bp.position ASC, p.name ASC`
    )
    .all(boardId) as Array<Omit<Prompt, "token_count"> & { token_count: number | null }>;
  return rows.map((r) => ({ ...r, token_count: r.token_count ?? 0 }));
}

/**
 * Replace the whole prompt set for a board in one transaction. Idempotent —
 * calling with the same list produces no observable change other than the
 * row-order being canonicalised. Missing prompt ids surface as a FK error.
 */
export function setBoardPrompts(
  db: Database,
  boardId: string,
  promptIds: string[]
): Prompt[] {
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM board_prompts WHERE board_id = ?").run(boardId);
    const insert = db.prepare(
      "INSERT INTO board_prompts (board_id, prompt_id, position) VALUES (?, ?, ?)"
    );
    promptIds.forEach((promptId, i) => insert.run(boardId, promptId, i));
  });
  tx();
  return listBoardPrompts(db, boardId);
}
