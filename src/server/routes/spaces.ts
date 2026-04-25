import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { getDb } from "../../db/index.js";
import * as q from "../../db/queries/index.js";
import {
  createSpaceSchema,
  reorderSpacesSchema,
  updateSpaceSchema,
} from "../validators/spaces.js";
import { bus } from "../events/bus.js";

const app = new Hono();

app.get("/", (c) => {
  return c.json(q.listSpaces(getDb()));
});

app.post("/", zValidator("json", createSpaceSchema), (c) => {
  const input = c.req.valid("json");
  // Domain errors (PrefixCollision / InvalidPrefix) bubble up to errorHandler
  // which maps them to 409 / 400 with the carried `code` field.
  const space = q.createSpace(getDb(), input);
  bus.publish({ type: "space.created", data: { spaceId: space.id, space } });
  return c.json(space, 201);
});

/**
 * Bulk reorder. The agent / UI passes the complete ordered list of space
 * ids; the server renumbers `position` to match. Default space is allowed
 * to appear anywhere — `is_default` is independent of sidebar position.
 *
 * Registered ABOVE the `:id` routes so the literal "reorder" segment doesn't
 * get captured as an id.
 */
app.post("/reorder", zValidator("json", reorderSpacesSchema), (c) => {
  const { ids } = c.req.valid("json");
  const updated = q.reorderSpaces(getDb(), ids);
  bus.publish({ type: "spaces.reordered", data: { ids } });
  return c.json(updated);
});

/**
 * Detail fetch returns the space plus its `board_ids` array (just ids — the
 * caller can hit `/api/boards/:id` per board if it needs the row). Matches
 * the spec's "minimal navigation data" guidance for read endpoints.
 */
app.get("/:id", (c) => {
  const id = c.req.param("id");
  const space = q.getSpace(getDb(), id);
  if (!space) return c.json({ error: "space not found" }, 404);
  const boardIds = (
    getDb()
      .prepare("SELECT id FROM boards WHERE space_id = ? ORDER BY created_at")
      .all(id) as Array<{ id: string }>
  ).map((r) => r.id);
  return c.json({ ...space, board_ids: boardIds });
});

app.patch("/:id", zValidator("json", updateSpaceSchema), (c) => {
  const id = c.req.param("id");
  const input = c.req.valid("json");
  const space = q.updateSpace(getDb(), id, input);
  if (!space) return c.json({ error: "space not found" }, 404);
  bus.publish({ type: "space.updated", data: { spaceId: id, space } });
  return c.json(space);
});

app.delete("/:id", (c) => {
  const id = c.req.param("id");
  const ok = q.deleteSpace(getDb(), id);
  if (!ok) return c.json({ error: "space not found" }, 404);
  bus.publish({ type: "space.deleted", data: { spaceId: id } });
  return c.json({ ok: true });
});

export default app;
