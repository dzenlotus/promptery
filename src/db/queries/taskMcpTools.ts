import type { Database } from "better-sqlite3";
import type { McpTool } from "./mcpTools.js";

export type TaskMcpTool = McpTool & { origin: string };

export function listTaskMcpTools(db: Database, taskId: string): TaskMcpTool[] {
  return db
    .prepare(
      `SELECT m.*, tm.origin FROM mcp_tools m
       JOIN task_mcp_tools tm ON tm.mcp_tool_id = m.id
       WHERE tm.task_id = ?
       ORDER BY tm.position ASC`
    )
    .all(taskId) as TaskMcpTool[];
}

export function getTaskMcpToolOrigin(
  db: Database,
  taskId: string,
  mcpToolId: string
): string | null {
  const row = db
    .prepare("SELECT origin FROM task_mcp_tools WHERE task_id = ? AND mcp_tool_id = ?")
    .get(taskId, mcpToolId) as { origin: string } | undefined;
  return row?.origin ?? null;
}

export function addTaskMcpTool(
  db: Database,
  taskId: string,
  mcpToolId: string,
  origin: string = "direct"
): void {
  db.prepare(
    `INSERT OR IGNORE INTO task_mcp_tools (task_id, mcp_tool_id, origin, position)
     VALUES (?, ?, ?, COALESCE((SELECT MAX(position) FROM task_mcp_tools WHERE task_id = ?), 0) + 1)`
  ).run(taskId, mcpToolId, origin, taskId);
}

export function removeTaskMcpTool(
  db: Database,
  taskId: string,
  mcpToolId: string
): boolean {
  const result = db
    .prepare("DELETE FROM task_mcp_tools WHERE task_id = ? AND mcp_tool_id = ?")
    .run(taskId, mcpToolId);
  return result.changes > 0;
}

export function removeTaskMcpToolsByOrigin(
  db: Database,
  taskId: string,
  origin: string
): void {
  db.prepare("DELETE FROM task_mcp_tools WHERE task_id = ? AND origin = ?").run(taskId, origin);
}
