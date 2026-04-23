import { describe, it, expect } from "vitest";
import {
  createMcpTool,
  deleteMcpTool,
  getMcpTool,
  getMcpToolByName,
  listMcpTools,
  updateMcpTool,
} from "../mcpTools.js";
import { ConflictError } from "../errors.js";
import { createTestDb } from "./helpers.js";

describe("mcp tools queries", () => {
  it("CRUD roundtrip", () => {
    const db = createTestDb();
    const t = createMcpTool(db, { name: "grep", content: "ripgrep wrapper" });
    expect(listMcpTools(db)).toHaveLength(1);
    expect(getMcpTool(db, t.id)?.name).toBe("grep");
    expect(getMcpToolByName(db, "grep")?.id).toBe(t.id);

    const updated = updateMcpTool(db, t.id, { content: "uses rg" });
    expect(updated?.content).toBe("uses rg");

    expect(deleteMcpTool(db, t.id)).toBe(true);
    expect(getMcpTool(db, t.id)).toBeNull();
  });

  it("enforces unique name", () => {
    const db = createTestDb();
    createMcpTool(db, { name: "dup" });
    expect(() => createMcpTool(db, { name: "dup" })).toThrow(ConflictError);
  });
});
