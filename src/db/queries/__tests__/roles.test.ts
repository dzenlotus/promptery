import { describe, it, expect } from "vitest";
import {
  createRole,
  deleteRole,
  getRole,
  getRoleWithRelations,
  listRoles,
  setRoleMcpTools,
  setRolePrompts,
  setRoleSkills,
  updateRole,
} from "../roles.js";
import { createPrompt } from "../prompts.js";
import { createSkill } from "../skills.js";
import { createMcpTool } from "../mcpTools.js";
import { ConflictError } from "../errors.js";
import { createTestDb } from "./helpers.js";

describe("roles queries", () => {
  it("CRUD roundtrip", () => {
    const db = createTestDb();
    const r = createRole(db, { name: "staff-architect", content: "think long" });
    expect(listRoles(db)).toHaveLength(1);
    expect(getRole(db, r.id)?.name).toBe("staff-architect");

    const updated = updateRole(db, r.id, { content: "think longer" });
    expect(updated?.content).toBe("think longer");

    expect(deleteRole(db, r.id)).toBe(true);
    expect(getRole(db, r.id)).toBeNull();
  });

  it("enforces unique name", () => {
    const db = createTestDb();
    createRole(db, { name: "dup" });
    expect(() => createRole(db, { name: "dup" })).toThrow(ConflictError);
  });

  it("setRolePrompts/Skills/McpTools replaces the full set in order", () => {
    const db = createTestDb();
    const role = createRole(db, { name: "r" });
    const p1 = createPrompt(db, { name: "p1" });
    const p2 = createPrompt(db, { name: "p2" });
    const s1 = createSkill(db, { name: "s1" });
    const m1 = createMcpTool(db, { name: "m1" });

    setRolePrompts(db, role.id, [p1.id, p2.id]);
    setRoleSkills(db, role.id, [s1.id]);
    setRoleMcpTools(db, role.id, [m1.id]);

    const full = getRoleWithRelations(db, role.id)!;
    expect(full.prompts.map((p) => p.id)).toEqual([p1.id, p2.id]);
    expect(full.skills.map((s) => s.id)).toEqual([s1.id]);
    expect(full.mcp_tools.map((m) => m.id)).toEqual([m1.id]);

    // Replace wipes prior contents.
    setRolePrompts(db, role.id, [p2.id]);
    const after = getRoleWithRelations(db, role.id)!;
    expect(after.prompts.map((p) => p.id)).toEqual([p2.id]);
  });

  it("deleting a role cascades the role_* link rows", () => {
    const db = createTestDb();
    const role = createRole(db, { name: "r" });
    const p = createPrompt(db, { name: "p" });
    setRolePrompts(db, role.id, [p.id]);

    deleteRole(db, role.id);

    const rows = db.prepare("SELECT * FROM role_prompts WHERE role_id = ?").all(role.id);
    expect(rows).toEqual([]);
  });

  it("deleting a referenced primitive cascades its role link", () => {
    const db = createTestDb();
    const role = createRole(db, { name: "r" });
    const p = createPrompt(db, { name: "p" });
    setRolePrompts(db, role.id, [p.id]);

    db.prepare("DELETE FROM prompts WHERE id = ?").run(p.id);

    const full = getRoleWithRelations(db, role.id)!;
    expect(full.prompts).toEqual([]);
  });
});
