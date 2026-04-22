import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { getDb } from "../../db/index.js";
import * as q from "../../db/queries/index.js";
import {
  createTaskSchema,
  updateTaskSchema,
  moveTaskSchema,
  addTagSchema,
} from "../validators/tasks.js";
import { bus } from "../events/bus.js";

export const boardTasksRoute = new Hono();

boardTasksRoute.get("/:boardId/tasks", (c) => {
  const boardId = c.req.param("boardId");
  if (!q.getBoard(getDb(), boardId)) return c.json({ error: "board not found" }, 404);
  const columnId = c.req.query("column_id");
  return c.json(q.listTasks(getDb(), boardId, columnId));
});

boardTasksRoute.post("/:boardId/tasks", zValidator("json", createTaskSchema), (c) => {
  const boardId = c.req.param("boardId");
  if (!q.getBoard(getDb(), boardId)) return c.json({ error: "board not found" }, 404);

  const { column_id, title, description } = c.req.valid("json");
  const column = q.getColumn(getDb(), column_id);
  if (!column || column.board_id !== boardId) {
    return c.json({ error: "column does not belong to this board" }, 400);
  }
  const task = q.createTask(getDb(), boardId, column_id, { title, description });
  bus.publish({ type: "task.created", data: { boardId, task } });
  return c.json(task, 201);
});

export const tasksRoute = new Hono();

tasksRoute.get("/:id", (c) => {
  const task = q.getTask(getDb(), c.req.param("id"));
  if (!task) return c.json({ error: "task not found" }, 404);
  return c.json(task);
});

tasksRoute.patch("/:id", zValidator("json", updateTaskSchema), (c) => {
  const id = c.req.param("id");
  const input = c.req.valid("json");

  const existing = q.getTask(getDb(), id);
  if (!existing) return c.json({ error: "task not found" }, 404);

  if (input.column_id !== undefined) {
    const column = q.getColumn(getDb(), input.column_id);
    if (!column || column.board_id !== existing.board_id) {
      return c.json({ error: "column does not belong to this board" }, 400);
    }
  }

  const updated = q.updateTask(getDb(), id, input);
  if (!updated) return c.json({ error: "task not found" }, 404);
  bus.publish({
    type: "task.updated",
    data: { boardId: updated.board_id, taskId: updated.id, task: updated },
  });
  return c.json(updated);
});

tasksRoute.post("/:id/move", zValidator("json", moveTaskSchema), (c) => {
  const id = c.req.param("id");
  const { column_id, position } = c.req.valid("json");
  const existing = q.getTask(getDb(), id);
  if (!existing) return c.json({ error: "task not found" }, 404);
  const column = q.getColumn(getDb(), column_id);
  if (!column || column.board_id !== existing.board_id) {
    return c.json({ error: "column does not belong to this board" }, 400);
  }
  const moved = q.moveTask(getDb(), id, column_id, position);
  if (!moved) return c.json({ error: "task not found" }, 404);
  bus.publish({
    type: "task.moved",
    data: { boardId: moved.board_id, taskId: moved.id, columnId: column_id, position },
  });
  return c.json(moved);
});

tasksRoute.delete("/:id", (c) => {
  const id = c.req.param("id");
  const existing = q.getTask(getDb(), id);
  if (!existing) return c.json({ error: "task not found" }, 404);
  q.deleteTask(getDb(), id);
  bus.publish({ type: "task.deleted", data: { boardId: existing.board_id, taskId: id } });
  return c.json({ ok: true });
});

tasksRoute.post("/:id/tags", zValidator("json", addTagSchema), (c) => {
  const taskId = c.req.param("id");
  const { tag_id } = c.req.valid("json");

  if (!q.getTask(getDb(), taskId)) return c.json({ error: "task not found" }, 404);
  const tag = q.getTag(getDb(), tag_id);
  if (!tag) return c.json({ error: "tag not found" }, 404);

  q.addTagToTask(getDb(), taskId, tag_id);
  bus.publish({ type: "task.tag_added", data: { taskId, tag } });
  return c.json({ ok: true }, 201);
});

tasksRoute.delete("/:id/tags/:tagId", (c) => {
  const taskId = c.req.param("id");
  const tagId = c.req.param("tagId");

  if (!q.getTask(getDb(), taskId)) return c.json({ error: "task not found" }, 404);

  const removed = q.removeTagFromTask(getDb(), taskId, tagId);
  if (!removed) return c.json({ error: "tag was not attached to task" }, 404);
  bus.publish({ type: "task.tag_removed", data: { taskId, tagId } });
  return c.json({ ok: true });
});

export default tasksRoute;
