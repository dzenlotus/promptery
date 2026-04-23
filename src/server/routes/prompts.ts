import { Hono } from "hono";
import { getDb } from "../../db/index.js";
import * as q from "../../db/queries/index.js";
import { createPromptSchema, updatePromptSchema } from "../validators/prompts.js";
import { validateJson } from "../middleware/validate.js";
import { bus } from "../events/bus.js";

const app = new Hono();

app.get("/", (c) => {
  return c.json(q.listPrompts(getDb()));
});

app.post("/", validateJson(createPromptSchema), (c) => {
  const input = c.req.valid("json");
  const prompt = q.createPrompt(getDb(), input);
  bus.publish({ type: "prompt.created", data: { prompt } });
  return c.json(prompt, 201);
});

app.get("/:id", (c) => {
  const prompt = q.getPrompt(getDb(), c.req.param("id"));
  if (!prompt) return c.json({ error: "prompt not found" }, 404);
  return c.json(prompt);
});

app.patch("/:id", validateJson(updatePromptSchema), (c) => {
  const id = c.req.param("id");
  const input = c.req.valid("json");
  const prompt = q.updatePrompt(getDb(), id, input);
  if (!prompt) return c.json({ error: "prompt not found" }, 404);
  bus.publish({ type: "prompt.updated", data: { promptId: prompt.id, prompt } });
  return c.json(prompt);
});

app.delete("/:id", (c) => {
  const id = c.req.param("id");
  const ok = q.deletePrompt(getDb(), id);
  if (!ok) return c.json({ error: "prompt not found" }, 404);
  bus.publish({ type: "prompt.deleted", data: { promptId: id } });
  return c.json({ ok: true });
});

export default app;
