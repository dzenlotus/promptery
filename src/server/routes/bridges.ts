import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  registerBridge,
  heartbeat,
  unregisterBridge,
  listBridges,
} from "../bridgeRegistry.js";

const registerSchema = z.object({
  pid: z.number().int(),
  agent_hint: z.string().optional().nullable(),
  /** Convenience: single role id to scope this bridge to. */
  role_id: z.string().optional().nullable(),
  /** List of role ids to scope this bridge to (union with role_id if both given). */
  role_ids: z.array(z.string()).optional().nullable(),
});

const app = new Hono();

app.get("/", (c) => c.json(listBridges()));

app.post("/register", zValidator("json", registerSchema), (c) => {
  const body = c.req.valid("json");
  const bridge = registerBridge(body);
  return c.json(bridge, 201);
});

app.post("/:id/heartbeat", (c) => {
  const ok = heartbeat(c.req.param("id"));
  if (!ok) return c.json({ error: "bridge not found" }, 404);
  return c.json({ ok: true });
});

app.post("/:id/unregister", (c) => {
  unregisterBridge(c.req.param("id"));
  return c.json({ ok: true });
});

export default app;
