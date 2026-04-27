import { Hono } from "hono";
import { getDb } from "../../db/index.js";
import * as q from "../../db/queries/index.js";
import { REPORT_KINDS } from "../../db/queries/agentReports.js";
import {
  createAgentReportSchema,
  searchReportsQuerySchema,
  updateAgentReportSchema,
} from "../validators/agentReports.js";
import { validateJson } from "../middleware/validate.js";
import { bus } from "../events/bus.js";

/**
 * Routes mounted at `/api/tasks/:taskId/reports` — list reports for one task,
 * create a new report on that task. The list endpoint accepts an optional
 * `?kind=…` filter so the UI's "Reports" section can render only e.g.
 * investigations without paginating the full set.
 */
export const taskReportsRoute = new Hono();

const REPORT_KINDS_SET = new Set<string>(REPORT_KINDS);

taskReportsRoute.get("/:taskId/reports", (c) => {
  const taskId = c.req.param("taskId");
  if (!q.getTask(getDb(), taskId)) return c.json({ error: "task not found" }, 404);
  const kindParam = c.req.query("kind");
  if (kindParam !== undefined && !REPORT_KINDS_SET.has(kindParam)) {
    return c.json({ error: "invalid kind" }, 400);
  }
  return c.json(
    q.listReportsForTask(getDb(), taskId, {
      kind: kindParam as q.ReportKind | undefined,
    })
  );
});

taskReportsRoute.post(
  "/:taskId/reports",
  validateJson(createAgentReportSchema),
  (c) => {
    const taskId = c.req.param("taskId");
    if (!q.getTask(getDb(), taskId)) return c.json({ error: "task not found" }, 404);
    const input = c.req.valid("json");
    const report = q.createReport(getDb(), { ...input, task_id: taskId });
    bus.publish({
      type: "report.created",
      data: { taskId, reportId: report.id, report },
    });
    return c.json(report, 201);
  }
);

/**
 * Routes mounted at `/api/reports` — singular report ops (read / update /
 * delete) and the workspace-wide FTS search endpoint. Search lives here
 * rather than under a task because results span boards.
 */
export const reportsRoute = new Hono();

reportsRoute.get("/search", (c) => {
  const parsed = searchReportsQuerySchema.safeParse(c.req.query());
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? "Invalid query" }, 400);
  }
  const hits = q.searchReports(getDb(), parsed.data.q, parsed.data.limit);
  return c.json(hits);
});

reportsRoute.get("/:id", (c) => {
  const report = q.getReport(getDb(), c.req.param("id"));
  if (!report) return c.json({ error: "report not found" }, 404);
  return c.json(report);
});

reportsRoute.patch("/:id", validateJson(updateAgentReportSchema), (c) => {
  const id = c.req.param("id");
  const existing = q.getReport(getDb(), id);
  if (!existing) return c.json({ error: "report not found" }, 404);
  const updated = q.updateReport(getDb(), id, c.req.valid("json"));
  if (!updated) return c.json({ error: "report not found" }, 404);
  bus.publish({
    type: "report.updated",
    data: { taskId: updated.task_id, reportId: updated.id, report: updated },
  });
  return c.json(updated);
});

reportsRoute.delete("/:id", (c) => {
  const id = c.req.param("id");
  const existing = q.getReport(getDb(), id);
  if (!existing) return c.json({ error: "report not found" }, 404);
  q.deleteReport(getDb(), id);
  bus.publish({
    type: "report.deleted",
    data: { taskId: existing.task_id, reportId: id },
  });
  return c.json({ ok: true });
});
