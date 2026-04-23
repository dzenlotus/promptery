import { Hono } from "hono";
import { getDb } from "../../db/index.js";
import * as q from "../../db/queries/index.js";
import {
  createRoleSchema,
  updateRoleSchema,
  setRolePromptsSchema,
  setRoleSkillsSchema,
  setRoleMcpToolsSchema,
} from "../validators/roles.js";
import { validateJson } from "../middleware/validate.js";
import { bus } from "../events/bus.js";

const app = new Hono();

app.get("/", (c) => {
  return c.json(q.listRoles(getDb()));
});

app.post("/", validateJson(createRoleSchema), (c) => {
  const input = c.req.valid("json");
  const role = q.createRole(getDb(), input);
  bus.publish({ type: "role.created", data: { role } });
  return c.json(role, 201);
});

app.get("/:id", (c) => {
  const role = q.getRoleWithRelations(getDb(), c.req.param("id"));
  if (!role) return c.json({ error: "role not found" }, 404);
  return c.json(role);
});

app.get("/:id/tasks-count", (c) => {
  const id = c.req.param("id");
  if (!q.getRole(getDb(), id)) return c.json({ error: "role not found" }, 404);
  return c.json({ count: q.countTasksWithRole(getDb(), id) });
});

app.patch("/:id", validateJson(updateRoleSchema), (c) => {
  const id = c.req.param("id");
  const input = c.req.valid("json");
  const role = q.updateRole(getDb(), id, input);
  if (!role) return c.json({ error: "role not found" }, 404);
  bus.publish({ type: "role.updated", data: { roleId: role.id, role } });
  return c.json(role);
});

app.delete("/:id", (c) => {
  const id = c.req.param("id");
  const ok = q.deleteRole(getDb(), id);
  if (!ok) return c.json({ error: "role not found" }, 404);
  bus.publish({ type: "role.deleted", data: { roleId: id } });
  return c.json({ ok: true });
});

app.put("/:id/prompts", validateJson(setRolePromptsSchema), (c) => {
  const id = c.req.param("id");
  if (!q.getRole(getDb(), id)) return c.json({ error: "role not found" }, 404);
  const { prompt_ids } = c.req.valid("json");
  q.setRolePrompts(getDb(), id, prompt_ids);
  const role = q.getRoleWithRelations(getDb(), id);
  bus.publish({ type: "role.relations_updated", data: { roleId: id, role: role! } });
  return c.json(role);
});

app.put("/:id/skills", validateJson(setRoleSkillsSchema), (c) => {
  const id = c.req.param("id");
  if (!q.getRole(getDb(), id)) return c.json({ error: "role not found" }, 404);
  const { skill_ids } = c.req.valid("json");
  q.setRoleSkills(getDb(), id, skill_ids);
  const role = q.getRoleWithRelations(getDb(), id);
  bus.publish({ type: "role.relations_updated", data: { roleId: id, role: role! } });
  return c.json(role);
});

app.put("/:id/mcp_tools", validateJson(setRoleMcpToolsSchema), (c) => {
  const id = c.req.param("id");
  if (!q.getRole(getDb(), id)) return c.json({ error: "role not found" }, 404);
  const { mcp_tool_ids } = c.req.valid("json");
  q.setRoleMcpTools(getDb(), id, mcp_tool_ids);
  const role = q.getRoleWithRelations(getDb(), id);
  bus.publish({ type: "role.relations_updated", data: { roleId: id, role: role! } });
  return c.json(role);
});

export default app;
