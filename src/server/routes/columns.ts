import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { getDb } from "../../db/index.js";
import * as q from "../../db/queries/index.js";
import { createColumnSchema, updateColumnSchema } from "../validators/columns.js";
import { bus } from "../events/bus.js";

/**
 * Columns have two URL shapes in the API:
 *   - list/create scoped to a board:    /api/boards/:boardId/columns
 *   - update/delete operate by column id: /api/columns/:id
 * Two small routers so each can be mounted at its natural prefix.
 */

export const boardColumnsRoute = new Hono();

boardColumnsRoute.get("/:boardId/columns", (c) => {
  const boardId = c.req.param("boardId");
  if (!q.getBoard(getDb(), boardId)) return c.json({ error: "board not found" }, 404);
  return c.json(q.listColumns(getDb(), boardId));
});

boardColumnsRoute.post("/:boardId/columns", zValidator("json", createColumnSchema), (c) => {
  const boardId = c.req.param("boardId");
  if (!q.getBoard(getDb(), boardId)) return c.json({ error: "board not found" }, 404);
  const { name } = c.req.valid("json");
  const column = q.createColumn(getDb(), boardId, name);
  bus.publish({ type: "column.created", data: { boardId, column } });
  return c.json(column, 201);
});

export const columnsRoute = new Hono();

columnsRoute.patch("/:id", zValidator("json", updateColumnSchema), (c) => {
  const id = c.req.param("id");
  const input = c.req.valid("json");
  const column = q.updateColumn(getDb(), id, input);
  if (!column) return c.json({ error: "column not found" }, 404);
  bus.publish({
    type: "column.updated",
    data: { boardId: column.board_id, columnId: column.id, column },
  });
  return c.json(column);
});

columnsRoute.delete("/:id", (c) => {
  const id = c.req.param("id");
  const existing = q.getColumn(getDb(), id);
  if (!existing) return c.json({ error: "column not found" }, 404);
  q.deleteColumn(getDb(), id);
  bus.publish({
    type: "column.deleted",
    data: { boardId: existing.board_id, columnId: id },
  });
  return c.json({ ok: true });
});

export default columnsRoute;
