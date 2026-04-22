import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { getDb } from "../../db/index.js";
import * as q from "../../db/queries/index.js";
import { createBoardSchema, updateBoardSchema } from "../validators/boards.js";
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

app.get("/:id", (c) => {
  const board = q.getBoard(getDb(), c.req.param("id"));
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

export default app;
