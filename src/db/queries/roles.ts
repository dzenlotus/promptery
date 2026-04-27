import type { Database } from "better-sqlite3";
import { nanoid } from "nanoid";
import { ConflictError } from "./errors.js";
import type { Prompt } from "./prompts.js";
import type { Skill } from "./skills.js";
import type { McpTool } from "./mcpTools.js";

export interface Role {
  id: string;
  name: string;
  content: string;
  color: string;
  created_at: number;
  updated_at: number;
}

export interface RoleWithRelations extends Role {
  prompts: Prompt[];
  skills: Skill[];
  mcp_tools: McpTool[];
  /** Sum of token_count across the role's default prompts. Computed from the
   *  cached per-prompt counts on the join — no separate storage. */
  token_count: number;
}

export interface CreateRoleInput {
  name: string;
  content?: string;
  color?: string;
}

export interface UpdateRoleInput {
  name?: string;
  content?: string;
  color?: string;
}

export function listRoles(db: Database): Role[] {
  return db.prepare("SELECT * FROM roles ORDER BY name ASC").all() as Role[];
}

export function countTasksWithRole(db: Database, id: string): number {
  const row = db
    .prepare("SELECT COUNT(*) as count FROM tasks WHERE role_id = ?")
    .get(id) as { count: number };
  return row.count;
}

export function getRole(db: Database, id: string): Role | null {
  const row = db.prepare("SELECT * FROM roles WHERE id = ?").get(id) as Role | undefined;
  return row ?? null;
}

export function getRoleByName(db: Database, name: string): Role | null {
  const row = db.prepare("SELECT * FROM roles WHERE name = ?").get(name) as Role | undefined;
  return row ?? null;
}

export function createRole(db: Database, input: CreateRoleInput): Role {
  if (getRoleByName(db, input.name)) {
    throw new ConflictError(`Role name "${input.name}" is already taken`, {
      field: "name",
    });
  }
  const id = nanoid();
  const now = Date.now();
  const content = input.content ?? "";
  const color = input.color ?? "#888";
  db.prepare(
    "INSERT INTO roles (id, name, content, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(id, input.name, content, color, now, now);
  return { id, name: input.name, content, color, created_at: now, updated_at: now };
}

export function updateRole(db: Database, id: string, input: UpdateRoleInput): Role | null {
  if (input.name !== undefined) {
    const clash = getRoleByName(db, input.name);
    if (clash && clash.id !== id) {
      throw new ConflictError(`Role name "${input.name}" is already taken`, {
      field: "name",
    });
    }
  }
  const current = getRole(db, id);
  if (!current) return null;

  const name = input.name ?? current.name;
  const content = input.content ?? current.content;
  const color = input.color ?? current.color;
  const now = Date.now();

  db.prepare(
    "UPDATE roles SET name = ?, content = ?, color = ?, updated_at = ? WHERE id = ?"
  ).run(name, content, color, now, id);

  return { id, name, content, color, created_at: current.created_at, updated_at: now };
}

/**
 * Removes the role and any task_* rows it had inherited onto tasks. The
 * tasks.role_id FK is `ON DELETE SET NULL`, but it can't reach into
 * task_prompts/skills/mcp_tools (those reference the *primitive*, not the
 * role), so we strip them here by matching the `role:<id>` origin marker.
 */
export function deleteRole(db: Database, id: string): boolean {
  const origin = `role:${id}`;
  let changes = 0;
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM task_prompts WHERE origin = ?").run(origin);
    db.prepare("DELETE FROM task_skills WHERE origin = ?").run(origin);
    db.prepare("DELETE FROM task_mcp_tools WHERE origin = ?").run(origin);
    const result = db.prepare("DELETE FROM roles WHERE id = ?").run(id);
    changes = result.changes;
  });
  tx();
  return changes > 0;
}

export function getRoleWithRelations(db: Database, id: string): RoleWithRelations | null {
  const role = getRole(db, id);
  if (!role) return null;
  const promptRows = db
    .prepare(
      `SELECT p.* FROM prompts p
       JOIN role_prompts rp ON rp.prompt_id = p.id
       WHERE rp.role_id = ?
       ORDER BY rp.position ASC`
    )
    .all(id) as Array<Omit<Prompt, "token_count"> & { token_count: number | null }>;
  const prompts: Prompt[] = promptRows.map((p) => ({
    ...p,
    token_count: p.token_count ?? 0,
  }));
  const skills = db
    .prepare(
      `SELECT s.* FROM skills s
       JOIN role_skills rs ON rs.skill_id = s.id
       WHERE rs.role_id = ?
       ORDER BY rs.position ASC`
    )
    .all(id) as Skill[];
  const mcp_tools = db
    .prepare(
      `SELECT m.* FROM mcp_tools m
       JOIN role_mcp_tools rm ON rm.mcp_tool_id = m.id
       WHERE rm.role_id = ?
       ORDER BY rm.position ASC`
    )
    .all(id) as McpTool[];
  const token_count = prompts.reduce((sum, p) => sum + p.token_count, 0);
  return { ...role, prompts, skills, mcp_tools, token_count };
}

/**
 * Replace the role's prompt set with the given ordered list. The role must
 * exist; missing prompt ids will surface as a foreign-key error.
 */
export function setRolePrompts(db: Database, roleId: string, promptIds: string[]): void {
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM role_prompts WHERE role_id = ?").run(roleId);
    const insert = db.prepare(
      "INSERT INTO role_prompts (role_id, prompt_id, position) VALUES (?, ?, ?)"
    );
    promptIds.forEach((promptId, i) => insert.run(roleId, promptId, i));
  });
  tx();
}

export function setRoleSkills(db: Database, roleId: string, skillIds: string[]): void {
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM role_skills WHERE role_id = ?").run(roleId);
    const insert = db.prepare(
      "INSERT INTO role_skills (role_id, skill_id, position) VALUES (?, ?, ?)"
    );
    skillIds.forEach((skillId, i) => insert.run(roleId, skillId, i));
  });
  tx();
}

export function setRoleMcpTools(db: Database, roleId: string, mcpToolIds: string[]): void {
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM role_mcp_tools WHERE role_id = ?").run(roleId);
    const insert = db.prepare(
      "INSERT INTO role_mcp_tools (role_id, mcp_tool_id, position) VALUES (?, ?, ?)"
    );
    mcpToolIds.forEach((mcpToolId, i) => insert.run(roleId, mcpToolId, i));
  });
  tx();
}
