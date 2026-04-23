import { describe, it, expect } from "vitest";
import { createBoard, deleteBoard } from "../boards.js";
import { createColumn, listColumns } from "../columns.js";
import {
  createTask,
  deleteTask,
  getTask,
  listTasks,
  moveTask,
  setTaskRole,
  updateTask,
} from "../tasks.js";
import { createPrompt } from "../prompts.js";
import { createSkill } from "../skills.js";
import { createMcpTool } from "../mcpTools.js";
import {
  createRole,
  deleteRole,
  setRolePrompts,
  setRoleSkills,
  setRoleMcpTools,
} from "../roles.js";
import {
  addTaskPrompt,
  removeTaskPrompt,
  listTaskPrompts,
} from "../taskPrompts.js";
import { addTaskSkill, listTaskSkills } from "../taskSkills.js";
import { addTaskMcpTool, listTaskMcpTools } from "../taskMcpTools.js";
import { createTestDb } from "./helpers.js";

function seedBoardWithColumns(db: ReturnType<typeof createTestDb>) {
  const board = createBoard(db, "Test Board");
  const todo = createColumn(db, board.id, "todo");
  const doing = createColumn(db, board.id, "doing");
  return { board, todo, doing };
}

describe("tasks queries", () => {
  it("auto-increments number per board and position per column", () => {
    const db = createTestDb();
    const { board, todo } = seedBoardWithColumns(db);

    const first = createTask(db, board.id, todo.id, { title: "first" });
    const second = createTask(db, board.id, todo.id, { title: "second" });

    expect(first.number).toBe(1);
    expect(second.number).toBe(2);
    expect(second.position).toBeGreaterThan(first.position);
  });

  it("getTask returns null role and empty relation arrays by default", () => {
    const db = createTestDb();
    const { board, todo } = seedBoardWithColumns(db);
    const task = createTask(db, board.id, todo.id, { title: "empty" });
    const got = getTask(db, task.id);
    expect(got?.role).toBeNull();
    expect(got?.prompts).toEqual([]);
    expect(got?.skills).toEqual([]);
    expect(got?.mcp_tools).toEqual([]);
  });

  it("listTasks returns each task with populated relations", () => {
    const db = createTestDb();
    const { board, todo } = seedBoardWithColumns(db);
    const task = createTask(db, board.id, todo.id, { title: "with direct" });
    const prompt = createPrompt(db, { name: "p1" });
    addTaskPrompt(db, task.id, prompt.id);

    const list = listTasks(db, board.id);
    expect(list).toHaveLength(1);
    expect(list[0]?.prompts[0]).toMatchObject({ name: "p1", origin: "direct" });
  });

  it("filters listTasks by column", () => {
    const db = createTestDb();
    const { board, todo, doing } = seedBoardWithColumns(db);
    createTask(db, board.id, todo.id, { title: "in todo" });
    createTask(db, board.id, doing.id, { title: "in doing" });

    expect(listTasks(db, board.id, todo.id)).toHaveLength(1);
    expect(listTasks(db, board.id, doing.id)).toHaveLength(1);
    expect(listTasks(db, board.id)).toHaveLength(2);
  });

  it("moves task between columns", () => {
    const db = createTestDb();
    const { board, todo, doing } = seedBoardWithColumns(db);
    const task = createTask(db, board.id, todo.id, { title: "to move" });

    const moved = moveTask(db, task.id, doing.id, 100.5);
    expect(moved?.column_id).toBe(doing.id);
    expect(moved?.position).toBe(100.5);
  });

  it("updateTask changes individual fields", () => {
    const db = createTestDb();
    const { board, todo } = seedBoardWithColumns(db);
    const task = createTask(db, board.id, todo.id, { title: "original" });

    const updated = updateTask(db, task.id, { title: "renamed", description: "body" });
    expect(updated?.title).toBe("renamed");
    expect(updated?.description).toBe("body");
  });

  it("cascade delete: removing board wipes its columns and tasks", () => {
    const db = createTestDb();
    const { board, todo } = seedBoardWithColumns(db);
    const task = createTask(db, board.id, todo.id, { title: "x" });

    deleteBoard(db, board.id);

    expect(getTask(db, task.id)).toBeNull();
    expect(listColumns(db, board.id)).toEqual([]);
  });

  it("deleteTask removes the task and returns false when repeated", () => {
    const db = createTestDb();
    const { board, todo } = seedBoardWithColumns(db);
    const task = createTask(db, board.id, todo.id, { title: "x" });

    expect(deleteTask(db, task.id)).toBe(true);
    expect(deleteTask(db, task.id)).toBe(false);
  });
});

describe("setTaskRole", () => {
  it("assigning a role copies its primitives into task_* with role-origin", () => {
    const db = createTestDb();
    const { board, todo } = seedBoardWithColumns(db);
    const task = createTask(db, board.id, todo.id, { title: "t" });
    const prompt = createPrompt(db, { name: "p1" });
    const skill = createSkill(db, { name: "s1" });
    const tool = createMcpTool(db, { name: "m1" });
    const role = createRole(db, { name: "r1" });
    setRolePrompts(db, role.id, [prompt.id]);
    setRoleSkills(db, role.id, [skill.id]);
    setRoleMcpTools(db, role.id, [tool.id]);

    setTaskRole(db, task.id, role.id);

    const full = getTask(db, task.id)!;
    expect(full.role?.id).toBe(role.id);
    expect(full.prompts).toEqual([
      expect.objectContaining({ id: prompt.id, origin: `role:${role.id}` }),
    ]);
    expect(full.skills).toEqual([
      expect.objectContaining({ id: skill.id, origin: `role:${role.id}` }),
    ]);
    expect(full.mcp_tools).toEqual([
      expect.objectContaining({ id: tool.id, origin: `role:${role.id}` }),
    ]);
  });

  it("changing role removes old role-origin links and seeds new ones", () => {
    const db = createTestDb();
    const { board, todo } = seedBoardWithColumns(db);
    const task = createTask(db, board.id, todo.id, { title: "t" });

    const p1 = createPrompt(db, { name: "p1" });
    const p2 = createPrompt(db, { name: "p2" });
    const roleA = createRole(db, { name: "a" });
    const roleB = createRole(db, { name: "b" });
    setRolePrompts(db, roleA.id, [p1.id]);
    setRolePrompts(db, roleB.id, [p2.id]);

    setTaskRole(db, task.id, roleA.id);
    setTaskRole(db, task.id, roleB.id);

    const prompts = listTaskPrompts(db, task.id);
    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toMatchObject({ id: p2.id, origin: `role:${roleB.id}` });
  });

  it("direct-origin primitives survive role changes", () => {
    const db = createTestDb();
    const { board, todo } = seedBoardWithColumns(db);
    const task = createTask(db, board.id, todo.id, { title: "t" });
    const direct = createPrompt(db, { name: "keep-me" });
    addTaskPrompt(db, task.id, direct.id, "direct");

    const role = createRole(db, { name: "r" });
    const rolePrompt = createPrompt(db, { name: "role-p" });
    setRolePrompts(db, role.id, [rolePrompt.id]);

    setTaskRole(db, task.id, role.id);
    setTaskRole(db, task.id, null);

    const remaining = listTaskPrompts(db, task.id);
    expect(remaining.map((p) => p.id)).toEqual([direct.id]);
  });

  it("clearing role removes role-origin items and role_id becomes null", () => {
    const db = createTestDb();
    const { board, todo } = seedBoardWithColumns(db);
    const task = createTask(db, board.id, todo.id, { title: "t" });
    const p = createPrompt(db, { name: "p" });
    const role = createRole(db, { name: "r" });
    setRolePrompts(db, role.id, [p.id]);

    setTaskRole(db, task.id, role.id);
    setTaskRole(db, task.id, null);

    const full = getTask(db, task.id)!;
    expect(full.role).toBeNull();
    expect(full.prompts).toEqual([]);
  });

  it("deleting role nulls tasks.role_id and wipes role-origin task links", () => {
    const db = createTestDb();
    const { board, todo } = seedBoardWithColumns(db);
    const task = createTask(db, board.id, todo.id, { title: "t" });
    const p = createPrompt(db, { name: "p" });
    const s = createSkill(db, { name: "s" });
    const role = createRole(db, { name: "r" });
    setRolePrompts(db, role.id, [p.id]);
    setRoleSkills(db, role.id, [s.id]);
    setTaskRole(db, task.id, role.id);

    deleteRole(db, role.id);

    const full = getTask(db, task.id)!;
    expect(full.role).toBeNull();
    expect(full.role_id).toBeNull();
    expect(full.prompts).toEqual([]);
    expect(full.skills).toEqual([]);
  });
});

describe("task add/remove direct links", () => {
  it("addTaskPrompt is idempotent; removeTaskPrompt toggles presence", () => {
    const db = createTestDb();
    const { board, todo } = seedBoardWithColumns(db);
    const task = createTask(db, board.id, todo.id, { title: "t" });
    const prompt = createPrompt(db, { name: "x" });

    addTaskPrompt(db, task.id, prompt.id);
    addTaskPrompt(db, task.id, prompt.id);
    expect(listTaskPrompts(db, task.id)).toHaveLength(1);

    expect(removeTaskPrompt(db, task.id, prompt.id)).toBe(true);
    expect(removeTaskPrompt(db, task.id, prompt.id)).toBe(false);
  });

  it("skill and mcp tool add/list work symmetrically", () => {
    const db = createTestDb();
    const { board, todo } = seedBoardWithColumns(db);
    const task = createTask(db, board.id, todo.id, { title: "t" });
    const skill = createSkill(db, { name: "s" });
    const tool = createMcpTool(db, { name: "m" });
    addTaskSkill(db, task.id, skill.id);
    addTaskMcpTool(db, task.id, tool.id);
    expect(listTaskSkills(db, task.id)).toHaveLength(1);
    expect(listTaskMcpTools(db, task.id)).toHaveLength(1);
  });
});
