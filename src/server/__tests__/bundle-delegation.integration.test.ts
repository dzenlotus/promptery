/**
 * Integration tests for #46 — mandatory delegation-protocol injection.
 *
 * Uses app.fetch + _setDbForTesting for per-test DB isolation so we can
 * control whether the delegation prompt exists in the DB.
 *
 * Verifies:
 *  - When a task has an active role AND the delegation prompt exists, a
 *    <system_prompts> block is prepended with priority="MUST_FOLLOW" and
 *    origin="system", before the <role> element.
 *  - When a task has no role, no <system_prompts> block is emitted.
 *  - If the delegation prompt is absent from the DB, the bundle is still
 *    returned cleanly without error (graceful degradation).
 *  - The <role> element is a complete, parseable standalone subtree.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../index.js";
import { _setDbForTesting } from "../../db/index.js";
import { createTestDb, type TestDb } from "../../db/__tests__/helpers/testDb.js";
import { nanoid } from "nanoid";

const DELEGATION_PROMPT_ID = "8oqIrb15DYuTyOfY2IDnH";
const DELEGATION_PROMPT_NAME = "delegation-protocol-mandatory";
const DELEGATION_CONTENT =
  "MANDATORY: You MUST delegate this task to a sub-agent. NEVER work on it directly.";

describe("bundle delegation injection (#46)", () => {
  let testDb: TestDb;
  let app: ReturnType<typeof createApp>["app"];

  beforeEach(() => {
    testDb = createTestDb();
    _setDbForTesting(testDb.db);
    app = createApp().app;
  });

  afterEach(() => {
    _setDbForTesting(null);
    testDb.close();
  });

  async function req(path: string): Promise<Response> {
    return await app.fetch(new Request(`http://test${path}`));
  }

  async function post(path: string, body: unknown): Promise<Response> {
    return await app.fetch(
      new Request(`http://test${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
    );
  }

  async function put(path: string, body: unknown): Promise<Response> {
    return await app.fetch(
      new Request(`http://test${path}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
    );
  }

  /** Seed a board + column + task, optionally with a role. */
  async function seedTask(withRole: boolean) {
    const board = (await (await post("/api/boards", { name: "del-board" })).json()) as {
      id: string;
    };
    const columns = (await (
      await req(`/api/boards/${board.id}/columns`)
    ).json()) as { id: string }[];
    const columnId = columns[0]!.id;

    const task = (await (
      await post(`/api/boards/${board.id}/tasks`, {
        column_id: columnId,
        title: "Del Task",
        description: "do it",
      })
    ).json()) as { id: string };

    if (withRole) {
      const role = (await (
        await post("/api/roles", { name: "del-role" })
      ).json()) as { id: string };
      await put(`/api/tasks/${task.id}/role`, { role_id: role.id });
    }

    return task.id;
  }

  /** Insert the delegation prompt directly into the DB with the known id. */
  function seedDelegationPrompt(): void {
    const now = Date.now();
    testDb.db
      .prepare(
        `INSERT INTO prompts (id, name, content, color, short_description, created_at, updated_at)
         VALUES (?, ?, ?, '#888', 'Mandatory delegation protocol', ?, ?)`
      )
      .run(DELEGATION_PROMPT_ID, DELEGATION_PROMPT_NAME, DELEGATION_CONTENT, now, now);
  }

  it("injects <system_prompts> with MUST_FOLLOW when role is present and delegation prompt exists", async () => {
    seedDelegationPrompt();
    const taskId = await seedTask(true);

    const res = await req(`/api/tasks/${taskId}/bundle`);
    expect(res.status).toBe(200);
    const xml = await res.text();

    expect(xml).toContain("<system_prompts>");
    expect(xml).toContain('priority="MUST_FOLLOW"');
    expect(xml).toContain('origin="system"');
    expect(xml).toContain(`name="${DELEGATION_PROMPT_NAME}"`);
    expect(xml).toContain(DELEGATION_CONTENT);

    // system_prompts must come before role
    const systemIdx = xml.indexOf("<system_prompts>");
    const roleIdx = xml.indexOf("<role");
    expect(systemIdx).toBeGreaterThan(-1);
    expect(roleIdx).toBeGreaterThan(-1);
    expect(systemIdx).toBeLessThan(roleIdx);
  });

  it("injects via name lookup when prompt was created without the hardcoded id", async () => {
    // Insert with a DIFFERENT id but the canonical name
    const now = Date.now();
    const altId = nanoid();
    testDb.db
      .prepare(
        `INSERT INTO prompts (id, name, content, color, short_description, created_at, updated_at)
         VALUES (?, ?, ?, '#888', NULL, ?, ?)`
      )
      .run(altId, DELEGATION_PROMPT_NAME, "alt content via name lookup", now, now);

    const taskId = await seedTask(true);
    const res = await req(`/api/tasks/${taskId}/bundle`);
    const xml = await res.text();

    expect(xml).toContain("<system_prompts>");
    expect(xml).toContain("alt content via name lookup");
  });

  it("omits <system_prompts> when task has no role", async () => {
    seedDelegationPrompt();
    const taskId = await seedTask(false);

    const res = await req(`/api/tasks/${taskId}/bundle`);
    expect(res.status).toBe(200);
    const xml = await res.text();

    expect(xml).not.toContain("<system_prompts>");
    expect(xml).not.toContain('priority="MUST_FOLLOW"');
    // bundle still valid
    expect(xml).toContain("<context>");
    expect(xml).toContain("<task");
    expect(xml).not.toContain("<role");
  });

  it("returns a valid bundle without error when delegation prompt is absent from DB", async () => {
    // No seedDelegationPrompt() call — DB has no delegation prompt
    const taskId = await seedTask(true);

    const res = await req(`/api/tasks/${taskId}/bundle`);
    expect(res.status).toBe(200);
    const xml = await res.text();

    // No injection but bundle is valid
    expect(xml).not.toContain("<system_prompts>");
    expect(xml).toContain("<context>");
    expect(xml).toContain("<role");
    expect(xml).toContain("<task");
  });

  it("preserves the <role> element as a complete standalone subtree", async () => {
    seedDelegationPrompt();
    const taskId = await seedTask(true);

    const res = await req(`/api/tasks/${taskId}/bundle`);
    const xml = await res.text();

    const roleStart = xml.indexOf("<role");
    const roleEnd = xml.indexOf("</role>", roleStart);
    expect(roleStart).toBeGreaterThan(-1);
    expect(roleEnd).toBeGreaterThan(roleStart);

    const roleSubtree = xml.slice(roleStart, roleEnd + "</role>".length);
    expect(roleSubtree.trimStart().startsWith("<role")).toBe(true);
    expect(roleSubtree.trimEnd().endsWith("</role>")).toBe(true);
  });
});
