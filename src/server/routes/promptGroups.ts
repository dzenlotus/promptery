import { Hono } from "hono";
import { getDb } from "../../db/index.js";
import * as q from "../../db/queries/index.js";
import {
  addGroupPromptSchema,
  createPromptGroupSchema,
  reorderPromptGroupsSchema,
  setGroupPromptsSchema,
  updatePromptGroupSchema,
} from "../validators/promptGroups.js";
import { validateJson } from "../middleware/validate.js";
import { bus } from "../events/bus.js";

const app = new Hono();

app.get("/", (c) => c.json(q.listPromptGroups(getDb())));

// /reorder before /:id so the trie matches it first.
app.post("/reorder", validateJson(reorderPromptGroupsSchema), (c) => {
  const { ids } = c.req.valid("json");
  // Pre-validate every id exists so a typo doesn't land in position 0 of
  // an empty reorder.
  for (const id of ids) {
    if (!q.getPromptGroup(getDb(), id)) {
      return c.json({ error: `prompt group not found: ${id}` }, 400);
    }
  }
  const groups = q.reorderPromptGroups(getDb(), ids);
  bus.publish({ type: "prompt_group.reordered", data: { ids } });
  return c.json(groups);
});

app.post("/", validateJson(createPromptGroupSchema), (c) => {
  const input = c.req.valid("json");
  if (input.prompt_ids) {
    for (const pid of input.prompt_ids) {
      if (!q.getPrompt(getDb(), pid)) {
        return c.json({ error: `prompt not found: ${pid}` }, 400);
      }
    }
  }
  const group = q.createPromptGroup(getDb(), input);
  bus.publish({ type: "prompt_group.created", data: { groupId: group.id, group } });
  return c.json(group, 201);
});

app.get("/:id", (c) => {
  const group = q.getPromptGroup(getDb(), c.req.param("id"));
  if (!group) return c.json({ error: "prompt group not found" }, 404);
  return c.json(group);
});

app.patch("/:id", validateJson(updatePromptGroupSchema), (c) => {
  const id = c.req.param("id");
  const group = q.updatePromptGroup(getDb(), id, c.req.valid("json"));
  if (!group) return c.json({ error: "prompt group not found" }, 404);
  bus.publish({ type: "prompt_group.updated", data: { groupId: id, group } });
  return c.json(group);
});

app.delete("/:id", (c) => {
  const id = c.req.param("id");
  const ok = q.deletePromptGroup(getDb(), id);
  if (!ok) return c.json({ error: "prompt group not found" }, 404);
  bus.publish({ type: "prompt_group.deleted", data: { groupId: id } });
  return c.json({ ok: true });
});

app.put("/:id/prompts", validateJson(setGroupPromptsSchema), (c) => {
  const id = c.req.param("id");
  const { prompt_ids } = c.req.valid("json");
  for (const pid of prompt_ids) {
    if (!q.getPrompt(getDb(), pid)) {
      return c.json({ error: `prompt not found: ${pid}` }, 400);
    }
  }
  const group = q.setGroupPrompts(getDb(), id, prompt_ids);
  if (!group) return c.json({ error: "prompt group not found" }, 404);
  bus.publish({ type: "prompt_group.updated", data: { groupId: id, group } });
  return c.json(group);
});

app.post("/:id/prompts", validateJson(addGroupPromptSchema), (c) => {
  const id = c.req.param("id");
  const { prompt_id } = c.req.valid("json");
  if (!q.getPromptGroup(getDb(), id)) {
    return c.json({ error: "prompt group not found" }, 404);
  }
  if (!q.getPrompt(getDb(), prompt_id)) {
    return c.json({ error: "prompt not found" }, 404);
  }
  q.addPromptToGroup(getDb(), id, prompt_id);
  const group = q.getPromptGroup(getDb(), id)!;
  bus.publish({ type: "prompt_group.updated", data: { groupId: id, group } });
  return c.json(group);
});

app.delete("/:id/prompts/:promptId", (c) => {
  const id = c.req.param("id");
  const promptId = c.req.param("promptId");
  if (!q.getPromptGroup(getDb(), id)) {
    return c.json({ error: "prompt group not found" }, 404);
  }
  q.removePromptFromGroup(getDb(), id, promptId);
  const group = q.getPromptGroup(getDb(), id)!;
  bus.publish({ type: "prompt_group.updated", data: { groupId: id, group } });
  return c.json(group);
});

export default app;
