import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { getDb } from "../../db/index.js";
import * as q from "../../db/queries/index.js";
import {
  createBoardSchema,
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
  const { name } = c.req.valid("json");
  const board = q.createBoard(getDb(), name);
  bus.publish({ type: "board.created", data: { boardId: board.id, board } });
  return c.json(board, 201);
});

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
