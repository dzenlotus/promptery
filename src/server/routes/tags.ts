import { Hono } from "hono";
import { getDb } from "../../db/index.js";
import * as q from "../../db/queries/index.js";
import {
  addTagPromptSchema,
  createTagSchema,
  setTagPromptsSchema,
  updateTagSchema,
} from "../validators/tags.js";
import { validateJson } from "../middleware/validate.js";
import { bus } from "../events/bus.js";

const app = new Hono();

/**
 * Broadcasts a `prompt.tags_changed` event for every prompt whose tag set
 * was just rewritten. Used after `setTagPrompts` (full membership replace)
 * and after deletes — both cases the affected prompts' chip sets need to
 * be invalidated even though no per-prompt mutation hit the API. The
 * caller passes either a list of explicitly-affected prompt ids or null
 * to fall back to "every prompt currently linked to the tag".
 */
function broadcastPromptTagsChanged(promptIds: string[]): void {
  for (const pid of promptIds) {
    const tags = q.getPromptTags(getDb(), pid);
    bus.publish({
      type: "prompt.tags_changed",
      data: { promptId: pid, tagIds: tags.map((t) => t.id) },
    });
  }
}

app.get("/", (c) => c.json(q.listTags(getDb())));

// Bulk-fetch every prompt's tag set in a single query. Used by the prompts
// sidebar to render tag chips on every row without an N+1 fetch loop.
// Defined before the `/:id` route so the trie matches the literal prefix
// first (Hono routing follows registration order on conflicts).
app.get("/by-prompt", (c) => c.json(q.listPromptsWithTags(getDb())));

app.post("/", validateJson(createTagSchema), (c) => {
  const input = c.req.valid("json");
  if (input.prompt_ids) {
    for (const pid of input.prompt_ids) {
      if (!q.getPrompt(getDb(), pid)) {
        return c.json({ error: `prompt not found: ${pid}` }, 400);
      }
    }
  }
  const tag = q.createTag(getDb(), input);
  bus.publish({ type: "tag.created", data: { tagId: tag.id, tag } });
  if (input.prompt_ids && input.prompt_ids.length > 0) {
    broadcastPromptTagsChanged(input.prompt_ids);
  }
  return c.json(tag, 201);
});

app.get("/:id", (c) => {
  const tag = q.getTag(getDb(), c.req.param("id"));
  if (!tag) return c.json({ error: "tag not found" }, 404);
  return c.json(tag);
});

app.patch("/:id", validateJson(updateTagSchema), (c) => {
  const id = c.req.param("id");
  const tag = q.updateTag(getDb(), id, c.req.valid("json"));
  if (!tag) return c.json({ error: "tag not found" }, 404);
  bus.publish({ type: "tag.updated", data: { tagId: id, tag } });
  return c.json(tag);
});

app.delete("/:id", (c) => {
  const id = c.req.param("id");
  // Snapshot the affected prompt ids before delete so we can refresh their
  // tag chips after the cascade runs.
  const detail = q.getTag(getDb(), id);
  const affectedPromptIds = detail?.prompts.map((p) => p.id) ?? [];

  const ok = q.deleteTag(getDb(), id);
  if (!ok) return c.json({ error: "tag not found" }, 404);
  bus.publish({ type: "tag.deleted", data: { tagId: id } });
  broadcastPromptTagsChanged(affectedPromptIds);
  return c.json({ ok: true });
});

app.put("/:id/prompts", validateJson(setTagPromptsSchema), (c) => {
  const id = c.req.param("id");
  const { prompt_ids } = c.req.valid("json");
  for (const pid of prompt_ids) {
    if (!q.getPrompt(getDb(), pid)) {
      return c.json({ error: `prompt not found: ${pid}` }, 400);
    }
  }
  // Capture the union of "before" and "after" prompt ids so prompts
  // dropped from the tag also get their chip set refreshed.
  const before = q.getTag(getDb(), id);
  if (!before) return c.json({ error: "tag not found" }, 404);
  const beforeIds = before.prompts.map((p) => p.id);
  const tag = q.setTagPrompts(getDb(), id, prompt_ids)!;
  bus.publish({ type: "tag.updated", data: { tagId: id, tag } });
  const affected = Array.from(new Set([...beforeIds, ...prompt_ids]));
  broadcastPromptTagsChanged(affected);
  return c.json(tag);
});

app.post("/:id/prompts", validateJson(addTagPromptSchema), (c) => {
  const id = c.req.param("id");
  const { prompt_id } = c.req.valid("json");
  if (!q.getTag(getDb(), id)) {
    return c.json({ error: "tag not found" }, 404);
  }
  if (!q.getPrompt(getDb(), prompt_id)) {
    return c.json({ error: "prompt not found" }, 404);
  }
  q.addPromptToTag(getDb(), id, prompt_id);
  const tag = q.getTag(getDb(), id)!;
  bus.publish({ type: "tag.updated", data: { tagId: id, tag } });
  broadcastPromptTagsChanged([prompt_id]);
  return c.json(tag);
});

app.delete("/:id/prompts/:promptId", (c) => {
  const id = c.req.param("id");
  const promptId = c.req.param("promptId");
  if (!q.getTag(getDb(), id)) {
    return c.json({ error: "tag not found" }, 404);
  }
  q.removePromptFromTag(getDb(), id, promptId);
  const tag = q.getTag(getDb(), id)!;
  bus.publish({ type: "tag.updated", data: { tagId: id, tag } });
  broadcastPromptTagsChanged([promptId]);
  return c.json(tag);
});

export default app;
