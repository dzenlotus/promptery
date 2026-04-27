import { Hono } from "hono";
import { getDb } from "../../db/index.js";
import { getDbPath } from "../../lib/paths.js";
import { runMigrationsSafe } from "../../db/migrationRunner.js";
import { bus } from "../events/bus.js";

const maintenanceRoute = new Hono();

/**
 * POST /api/maintenance/migrate
 *
 * Triggers the migration wizard from the UI (Settings → Data).
 * Returns MigrationResult — the caller should handle status:"rolled-back"
 * as an error and display result.error to the user.
 *
 * Note: migrations are normally run at hub startup (via initDb). This endpoint
 * exists for scenarios where the user wants to re-trigger after a failed
 * startup migration (e.g. after resolving a disk-space issue) or to check
 * the current migration state from the UI.
 */
maintenanceRoute.post("/migrate", async (c) => {
  const db = getDb();
  const dbPath = getDbPath();

  try {
    const result = await runMigrationsSafe(db, dbPath, {
      onStep: (name) => {
        bus.publish({ type: "maintenance.migration_step", data: { name } });
      },
      onSnapshot: (snapshotPath) => {
        bus.publish({
          type: "maintenance.migration_snapshot",
          data: { snapshotPath },
        });
      },
      onRollback: (reason) => {
        bus.publish({
          type: "maintenance.migration_rolledback",
          data: { reason },
        });
      },
    });

    if (result.status === "rolled-back") {
      return c.json(result, 500);
    }

    return c.json(result);
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : "Migration failed" },
      500
    );
  }
});

export default maintenanceRoute;
