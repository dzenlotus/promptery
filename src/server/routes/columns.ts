import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { getDb } from "../../db/index.js";
import * as q from "../../db/queries/index.js";
import { ColumnNotEmptyError } from "../../db/queries/errors.js";
import {
  createColumnSchema,
  reorderColumnsSchema,
  setColumnPromptsSchema,
  setColumnRoleSchema,
  updateColumnSchema,
} from "../validators/columns.js";
import { bus } from "../events/bus.js";

/**
 * Columns have two URL shapes in the API:
 *   - list/create scoped to a board:    /api/boards/:boardId/columns
 *   - update/delete/role/prompts by id: /api/columns/:id[/...]
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

/**
 * Bulk reorder columns for a board.
 *
 * Accepts the full ordered list of column IDs and rewrites positions in a
 * single BEGIN/COMMIT transaction. Any column ID not belonging to this board
 * is silently ignored (its position row just doesn't match).
 *
 * Emits a single `column.reordered` WS event instead of N `column.updated`
 * events to keep chat bandwidth low.
 *
 * Rebalance note: this endpoint always writes integer positions (1, 2, 3…),
 * which resets any fractional positions accumulated by midpoint insertion.
 * This acts as the periodic rebalance: every explicit reorder resets the
 * scale rather than waiting for a depth trigger.
 */
boardColumnsRoute.patch("/:boardId/columns/order", zValidator("json", reorderColumnsSchema), (c) => {
  const boardId = c.req.param("boardId");
  if (!q.getBoard(getDb(), boardId)) return c.json({ error: "board not found" }, 404);
  const { columnIds } = c.req.valid("json");
  // Validate all IDs belong to this board.
  for (const id of columnIds) {
    const col = q.getColumn(getDb(), id);
    if (!col) return c.json({ error: `column not found: ${id}` }, 404);
    if (col.board_id !== boardId) {
      return c.json({ error: `column ${id} does not belong to board ${boardId}` }, 400);
    }
  }
  const columns = q.reorderColumns(getDb(), boardId, columnIds);
  bus.publish({ type: "column.reordered", data: { boardId, columnIds } });
  return c.json(columns);
});

export const columnsRoute = new Hono();

columnsRoute.get("/:id", (c) => {
  const column = q.getColumnWithRelations(getDb(), c.req.param("id"));
  if (!column) return c.json({ error: "column not found" }, 404);
  return c.json(column);
});

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
  try {
    q.deleteColumn(getDb(), id);
  } catch (err) {
    if (err instanceof ColumnNotEmptyError) {
      return c.json(
        {
          error: "ColumnNotEmpty",
          message: err.message,
          taskCount: err.taskCount,
        },
        409
      );
    }
    throw err;
  }
  bus.publish({
    type: "column.deleted",
    data: { boardId: existing.board_id, columnId: id },
  });
  return c.json({ ok: true });
});

columnsRoute.put("/:id/role", zValidator("json", setColumnRoleSchema), (c) => {
  const id = c.req.param("id");
  const existing = q.getColumn(getDb(), id);
  if (!existing) return c.json({ error: "column not found" }, 404);
  const { role_id } = c.req.valid("json");
  if (role_id && !q.getRole(getDb(), role_id)) {
    return c.json({ error: "role not found" }, 404);
  }
  const column = q.setColumnRole(getDb(), id, role_id);
  if (!column) return c.json({ error: "column not found" }, 404);
  bus.publish({
    type: "column.role_changed",
    data: { boardId: column.board_id, columnId: id, roleId: role_id, column },
  });
  return c.json(column);
});

columnsRoute.get("/:id/prompts", (c) => {
  const id = c.req.param("id");
  if (!q.getColumn(getDb(), id)) return c.json({ error: "column not found" }, 404);
  return c.json(q.listColumnPrompts(getDb(), id));
});

columnsRoute.put("/:id/prompts", zValidator("json", setColumnPromptsSchema), (c) => {
  const id = c.req.param("id");
  const existing = q.getColumn(getDb(), id);
  if (!existing) return c.json({ error: "column not found" }, 404);
  const { prompt_ids } = c.req.valid("json");
  for (const pid of prompt_ids) {
    if (!q.getPrompt(getDb(), pid)) {
      return c.json({ error: `prompt not found: ${pid}` }, 400);
    }
  }
  const prompts = q.setColumnPrompts(getDb(), id, prompt_ids);
  bus.publish({
    type: "column.prompts_changed",
    data: { boardId: existing.board_id, columnId: id, prompts },
  });
  return c.json(prompts);
});

export default columnsRoute;
