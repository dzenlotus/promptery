import { Hono } from "hono";
import { getDb } from "../../db/index.js";
import * as q from "../../db/queries/index.js";
import { createMcpToolSchema, updateMcpToolSchema } from "../validators/mcpTools.js";
import { validateJson } from "../middleware/validate.js";
import { bus } from "../events/bus.js";

const app = new Hono();

app.get("/", (c) => {
  return c.json(q.listMcpTools(getDb()));
});

app.post("/", validateJson(createMcpToolSchema), (c) => {
  const input = c.req.valid("json");
  const tool = q.createMcpTool(getDb(), input);
  bus.publish({ type: "mcp_tool.created", data: { mcpTool: tool } });
  return c.json(tool, 201);
});

app.get("/:id", (c) => {
  const tool = q.getMcpTool(getDb(), c.req.param("id"));
  if (!tool) return c.json({ error: "mcp tool not found" }, 404);
  return c.json(tool);
});

app.patch("/:id", validateJson(updateMcpToolSchema), (c) => {
  const id = c.req.param("id");
  const input = c.req.valid("json");
  const tool = q.updateMcpTool(getDb(), id, input);
  if (!tool) return c.json({ error: "mcp tool not found" }, 404);
  bus.publish({ type: "mcp_tool.updated", data: { mcpToolId: tool.id, mcpTool: tool } });
  return c.json(tool);
});

app.delete("/:id", (c) => {
  const id = c.req.param("id");
  const ok = q.deleteMcpTool(getDb(), id);
  if (!ok) return c.json({ error: "mcp tool not found" }, 404);
  bus.publish({ type: "mcp_tool.deleted", data: { mcpToolId: id } });
  return c.json({ ok: true });
});

export default app;
