import { Hono } from "hono";
import { getDb } from "../../db/index.js";
import * as q from "../../db/queries/index.js";
import { createSkillSchema, updateSkillSchema } from "../validators/skills.js";
import { validateJson } from "../middleware/validate.js";
import { bus } from "../events/bus.js";

const app = new Hono();

app.get("/", (c) => {
  return c.json(q.listSkills(getDb()));
});

app.post("/", validateJson(createSkillSchema), (c) => {
  const input = c.req.valid("json");
  const skill = q.createSkill(getDb(), input);
  bus.publish({ type: "skill.created", data: { skill } });
  return c.json(skill, 201);
});

app.get("/:id", (c) => {
  const skill = q.getSkill(getDb(), c.req.param("id"));
  if (!skill) return c.json({ error: "skill not found" }, 404);
  return c.json(skill);
});

app.patch("/:id", validateJson(updateSkillSchema), (c) => {
  const id = c.req.param("id");
  const input = c.req.valid("json");
  const skill = q.updateSkill(getDb(), id, input);
  if (!skill) return c.json({ error: "skill not found" }, 404);
  bus.publish({ type: "skill.updated", data: { skillId: skill.id, skill } });
  return c.json(skill);
});

app.delete("/:id", (c) => {
  const id = c.req.param("id");
  const ok = q.deleteSkill(getDb(), id);
  if (!ok) return c.json({ error: "skill not found" }, 404);
  bus.publish({ type: "skill.deleted", data: { skillId: id } });
  return c.json({ ok: true });
});

export default app;
