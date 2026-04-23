import { Hono } from "hono";
import { getDb } from "../../db/index.js";
import * as q from "../../db/queries/index.js";
import { bulkSettingsSchema, setSettingSchema } from "../validators/settings.js";
import { validateJson } from "../middleware/validate.js";
import { bus } from "../events/bus.js";

const app = new Hono();

app.get("/", (c) => {
  const prefix = c.req.query("prefix");
  return c.json(q.listSettings(getDb(), prefix));
});

// /bulk is declared before /:key so Hono's trie matches it first.
app.post("/bulk", validateJson(bulkSettingsSchema), (c) => {
  const { entries } = c.req.valid("json");
  const results = q.setSettings(getDb(), entries);
  for (const r of results) {
    bus.publish({ type: "setting.changed", data: { key: r.key, value: r.value } });
  }
  return c.json(results);
});

app.get("/:key", (c) => {
  const key = c.req.param("key");
  const value = q.getSetting(getDb(), key);
  if (value === null) return c.json({ error: "setting not found", key }, 404);
  return c.json({ key, value });
});

app.put("/:key", validateJson(setSettingSchema), (c) => {
  const key = c.req.param("key");
  const { value } = c.req.valid("json");
  const result = q.setSetting(getDb(), key, value);
  bus.publish({ type: "setting.changed", data: { key, value: result.value } });
  return c.json(result);
});

app.delete("/:key", (c) => {
  const key = c.req.param("key");
  const result = q.deleteSetting(getDb(), key);
  bus.publish({ type: "setting.deleted", data: { key } });
  return c.json(result);
});

export default app;
