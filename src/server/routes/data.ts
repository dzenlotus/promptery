import { Hono } from "hono";
import { getDb } from "../../db/index.js";
import {
  type ExportBundle,
  buildExport,
} from "../../db/export.js";
import { applyImport, previewImport } from "../../db/import.js";
import {
  createBackup,
  deleteBackup,
  listBackups,
  restoreBackup,
} from "../../db/backup.js";
import { bus } from "../events/bus.js";
import { validateJson } from "../middleware/validate.js";
import {
  createBackupSchema,
  exportSchema,
  importApplySchema,
  importPreviewSchema,
} from "../validators/data.js";

export function createDataRouter(appVersion: string) {
  const app = new Hono();

  app.post("/export", validateJson(exportSchema), (c) => {
    const options = c.req.valid("json");
    const bundle = buildExport(getDb(), options, appVersion);
    return c.json(bundle);
  });

  app.post("/import/preview", validateJson(importPreviewSchema), (c) => {
    const { bundle, strategy } = c.req.valid("json");
    const preview = previewImport(getDb(), bundle as ExportBundle | null, strategy ?? "skip");
    return c.json(preview);
  });

  app.post("/import/apply", validateJson(importApplySchema), (c) => {
    const { bundle, strategy } = c.req.valid("json");
    let result;
    try {
      result = applyImport(getDb(), bundle as ExportBundle | null, strategy);
    } catch (err) {
      return c.json(
        { error: err instanceof Error ? err.message : "Import failed" },
        400
      );
    }
    bus.publish({
      type: "data.imported",
      data: {
        counts: {
          boards: result.counts.boards,
          roles: result.counts.roles,
          prompts: result.counts.prompts,
          skills: result.counts.skills,
          mcp_tools: result.counts.mcp_tools,
        },
      },
    });
    return c.json(result);
  });

  app.get("/backups", async (c) => {
    const list = await listBackups();
    return c.json(list);
  });

  app.post("/backups", validateJson(createBackupSchema), async (c) => {
    const { name } = c.req.valid("json");
    const backup = await createBackup(name, "manual");
    bus.publish({
      type: "data.backup_created",
      data: { filename: backup.filename, reason: backup.reason },
    });
    return c.json(backup, 201);
  });

  app.post("/backups/:filename/restore", async (c) => {
    const filename = c.req.param("filename");
    try {
      const result = await restoreBackup(filename);
      bus.publish({ type: "data.restored", data: { filename } });
      return c.json(result);
    } catch (err) {
      return c.json(
        { error: err instanceof Error ? err.message : "Restore failed" },
        400
      );
    }
  });

  app.delete("/backups/:filename", async (c) => {
    const filename = c.req.param("filename");
    try {
      const result = await deleteBackup(filename);
      bus.publish({ type: "data.backup_deleted", data: { filename } });
      return c.json(result);
    } catch (err) {
      return c.json(
        { error: err instanceof Error ? err.message : "Delete failed" },
        400
      );
    }
  });

  return app;
}
