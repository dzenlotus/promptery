import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { getDb } from "../../db/index.js";
import * as q from "../../db/queries/index.js";
import { createTagSchema, updateTagSchema } from "../validators/tags.js";
import { bus } from "../events/bus.js";

const app = new Hono();

app.get("/", (c) => {
  const kind = c.req.query("kind") as q.TagKind | undefined;
  return c.json(q.listTags(getDb(), kind));
});

app.post("/", zValidator("json", createTagSchema), (c) => {
  const input = c.req.valid("json");
  const tag = q.createTag(getDb(), input);
  bus.publish({ type: "tag.created", data: { tag } });
  return c.json(tag, 201);
});

app.get("/:id", (c) => {
  const tag = q.getTag(getDb(), c.req.param("id"));
  if (!tag) return c.json({ error: "tag not found" }, 404);
  return c.json(tag);
});

app.patch("/:id", zValidator("json", updateTagSchema), (c) => {
  const id = c.req.param("id");
  const input = c.req.valid("json");
  const tag = q.updateTag(getDb(), id, input);
  if (!tag) return c.json({ error: "tag not found" }, 404);
  bus.publish({ type: "tag.updated", data: { tagId: tag.id, tag } });
  return c.json(tag);
});

app.delete("/:id", (c) => {
  const id = c.req.param("id");
  const ok = q.deleteTag(getDb(), id);
  if (!ok) return c.json({ error: "tag not found" }, 404);
  bus.publish({ type: "tag.deleted", data: { tagId: id } });
  return c.json({ ok: true });
});

export default app;
