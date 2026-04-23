import { describe, it, expect } from "vitest";
import {
  createSkill,
  deleteSkill,
  getSkill,
  getSkillByName,
  listSkills,
  updateSkill,
} from "../skills.js";
import { ConflictError } from "../errors.js";
import { createTestDb } from "./helpers.js";

describe("skills queries", () => {
  it("CRUD roundtrip", () => {
    const db = createTestDb();
    const s = createSkill(db, { name: "ts-perf" });
    expect(listSkills(db)).toHaveLength(1);
    expect(getSkill(db, s.id)?.name).toBe("ts-perf");
    expect(getSkillByName(db, "ts-perf")?.id).toBe(s.id);

    const updated = updateSkill(db, s.id, { content: "hot loops" });
    expect(updated?.content).toBe("hot loops");

    expect(deleteSkill(db, s.id)).toBe(true);
    expect(getSkill(db, s.id)).toBeNull();
  });

  it("enforces unique name on create and update", () => {
    const db = createTestDb();
    createSkill(db, { name: "dup" });
    expect(() => createSkill(db, { name: "dup" })).toThrow(ConflictError);

    const other = createSkill(db, { name: "other" });
    expect(() => updateSkill(db, other.id, { name: "dup" })).toThrow(ConflictError);
  });
});
