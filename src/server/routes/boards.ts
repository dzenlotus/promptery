import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { getDb } from "../../db/index.js";
import * as q from "../../db/queries/index.js";
import {
  createBoardSchema,
  moveBoardToSpaceSchema,
  reorderBoardsSchema,
  setBoardPromptsSchema,
  setBoardRoleSchema,
  updateBoardSchema,
} from "../validators/boards.js";
import { bus } from "../events/bus.js";

const app = new Hono();

app.get("/", (c) => {
  return c.json(q.listBoards(getDb()));
});

app.post("/", zValidator("json", createBoardSchema), (c) => {
  const { name, space_id } = c.req.valid("json");
  if (space_id && !q.getSpace(getDb(), space_id)) {
    return c.json({ error: "space not found" }, 404);
  }
  const board = q.createBoard(getDb(), name, { space_id });
  bus.publish({ type: "board.created", data: { boardId: board.id, board } });
  return c.json(board, 201);
});

/**
 * Bulk reorder boards within a single space. The body carries `space_id`
 * (the affected space) and `ids` (the desired order); the repo renumbers
 * positions 1..N. Boards from other spaces in `ids` are silently ignored
 * at the repo layer.
 *
 * Registered BEFORE the `:id` routes so "reorder" isn't matched as a board id.
 */
app.post("/reorder", zValidator("json", reorderBoardsSchema), (c) => {
  const { space_id, ids } = c.req.valid("json");
  if (!q.getSpace(getDb(), space_id)) {
    return c.json({ error: "space not found" }, 404);
  }
  const updated = q.reorderBoards(getDb(), space_id, ids);
  bus.publish({ type: "boards.reordered", data: { spaceId: space_id, ids } });
  return c.json(updated);
});

/**
 * Move a board to a different space. Re-slugs every task on the board to
 * the destination space's prefix; the destination counter advances by the
 * number of tasks moved. Internal task ids are preserved — anything held
 * by id keeps resolving across the move. See spaces.ts:moveBoardToSpace
 * for the semantics.
 */
app.post(
  "/:id/move-to-space",
  zValidator("json", moveBoardToSpaceSchema),
  (c) => {
    const id = c.req.param("id");
    const { space_id, position } = c.req.valid("json");
    // Errors (NotFoundError) bubble to errorHandler → 404.
    const result = q.moveBoardToSpace(getDb(), id, space_id, { position });
    bus.publish({
      type: "board.moved_to_space",
      data: {
        boardId: id,
        spaceId: space_id,
        reslugged_count: result.reslugged_count,
      },
    });
    return c.json(result);
  }
);

// Detail fetch returns the enriched shape with role + direct prompts so UI
// can render the board header without a second request.
app.get("/:id", (c) => {
  const board = q.getBoardWithRelations(getDb(), c.req.param("id"));
  if (!board) return c.json({ error: "board not found" }, 404);
  return c.json(board);
});

app.patch("/:id", zValidator("json", updateBoardSchema), (c) => {
  const { name } = c.req.valid("json");
  if (name === undefined) return c.json({ error: "no fields to update" }, 400);
  const board = q.updateBoard(getDb(), c.req.param("id"), name);
  if (!board) return c.json({ error: "board not found" }, 404);
  bus.publish({ type: "board.updated", data: { boardId: board.id, board } });
  return c.json(board);
});

app.delete("/:id", (c) => {
  const id = c.req.param("id");
  const ok = q.deleteBoard(getDb(), id);
  if (!ok) return c.json({ error: "board not found" }, 404);
  bus.publish({ type: "board.deleted", data: { boardId: id } });
  return c.json({ ok: true });
});

app.put("/:id/role", zValidator("json", setBoardRoleSchema), (c) => {
  const id = c.req.param("id");
  const { role_id } = c.req.valid("json");
  if (role_id && !q.getRole(getDb(), role_id)) {
    return c.json({ error: "role not found" }, 404);
  }
  const board = q.setBoardRole(getDb(), id, role_id);
  if (!board) return c.json({ error: "board not found" }, 404);
  bus.publish({
    type: "board.role_changed",
    data: { boardId: id, roleId: role_id, board },
  });
  return c.json(board);
});

app.get("/:id/prompts", (c) => {
  const id = c.req.param("id");
  if (!q.getBoard(getDb(), id)) return c.json({ error: "board not found" }, 404);
  return c.json(q.listBoardPrompts(getDb(), id));
});

app.put("/:id/prompts", zValidator("json", setBoardPromptsSchema), (c) => {
  const id = c.req.param("id");
  if (!q.getBoard(getDb(), id)) return c.json({ error: "board not found" }, 404);
  const { prompt_ids } = c.req.valid("json");
  // Validate prompt ids exist so the FK error surfaces as a clean 400
  // rather than a 500.
  for (const pid of prompt_ids) {
    if (!q.getPrompt(getDb(), pid)) {
      return c.json({ error: `prompt not found: ${pid}` }, 400);
    }
  }
  const prompts = q.setBoardPrompts(getDb(), id, prompt_ids);
  bus.publish({
    type: "board.prompts_changed",
    data: { boardId: id, prompts },
  });
  return c.json(prompts);
});

export default app;
