import type { Database } from "better-sqlite3";
import { nanoid } from "nanoid";
import { ConflictError } from "./errors.js";

export interface McpTool {
  id: string;
  name: string;
  content: string;
  color: string;
  created_at: number;
  updated_at: number;
}

export interface CreateMcpToolInput {
  name: string;
  content?: string;
  color?: string;
}

export interface UpdateMcpToolInput {
  name?: string;
  content?: string;
  color?: string;
}

export function listMcpTools(db: Database): McpTool[] {
  return db.prepare("SELECT * FROM mcp_tools ORDER BY name ASC").all() as McpTool[];
}

export function getMcpTool(db: Database, id: string): McpTool | null {
  const row = db.prepare("SELECT * FROM mcp_tools WHERE id = ?").get(id) as McpTool | undefined;
  return row ?? null;
}

export function getMcpToolByName(db: Database, name: string): McpTool | null {
  const row = db
    .prepare("SELECT * FROM mcp_tools WHERE name = ?")
    .get(name) as McpTool | undefined;
  return row ?? null;
}

export function createMcpTool(db: Database, input: CreateMcpToolInput): McpTool {
  if (getMcpToolByName(db, input.name)) {
    throw new ConflictError(`MCP tool name "${input.name}" is already taken`, {
      field: "name",
    });
  }
  const id = nanoid();
  const now = Date.now();
  const content = input.content ?? "";
  const color = input.color ?? "#888";
  db.prepare(
    "INSERT INTO mcp_tools (id, name, content, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(id, input.name, content, color, now, now);
  return { id, name: input.name, content, color, created_at: now, updated_at: now };
}

export function updateMcpTool(
  db: Database,
  id: string,
  input: UpdateMcpToolInput
): McpTool | null {
  if (input.name !== undefined) {
    const clash = getMcpToolByName(db, input.name);
    if (clash && clash.id !== id) {
      throw new ConflictError(`MCP tool name "${input.name}" is already taken`, {
      field: "name",
    });
    }
  }
  const current = getMcpTool(db, id);
  if (!current) return null;

  const name = input.name ?? current.name;
  const content = input.content ?? current.content;
  const color = input.color ?? current.color;
  const now = Date.now();

  db.prepare(
    "UPDATE mcp_tools SET name = ?, content = ?, color = ?, updated_at = ? WHERE id = ?"
  ).run(name, content, color, now, id);

  return { id, name, content, color, created_at: current.created_at, updated_at: now };
}

export function deleteMcpTool(db: Database, id: string): boolean {
  const result = db.prepare("DELETE FROM mcp_tools WHERE id = ?").run(id);
  return result.changes > 0;
}
