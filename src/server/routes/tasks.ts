import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { getDb } from "../../db/index.js";
import * as q from "../../db/queries/index.js";
import {
  createTaskSchema,
  updateTaskSchema,
  moveTaskSchema,
  setTaskRoleSchema,
  addTaskPromptSchema,
  addTaskSkillSchema,
  addTaskMcpToolSchema,
  searchTasksQuerySchema,
} from "../validators/tasks.js";
import { bus } from "../events/bus.js";
import { buildContextBundle } from "../../lib/context.js";
import { resolveTaskContext } from "../../db/inheritance/index.js";
import { getBridgeRoleIds } from "../bridgeRegistry.js";

export const boardTasksRoute = new Hono();

boardTasksRoute.get("/:boardId/tasks", (c) => {
  const boardId = c.req.param("boardId");
  if (!q.getBoard(getDb(), boardId)) return c.json({ error: "board not found" }, 404);
  const columnId = c.req.query("column_id");
  const assignedToRole = c.req.query("assigned_to_role");

  let tasks = q.listTasks(getDb(), boardId, columnId);

  // When assigned_to_role=self the bridge wants only tasks whose role_id is
  // in its registered role set. Resolve the caller's role_ids from the
  // X-Bridge-Id header; if the bridge isn't found or has no role_ids scoped,
  // fall back to the unfiltered list so existing behaviour is preserved.
  if (assignedToRole === "self") {
    const bridgeId = c.req.header("X-Bridge-Id");
    if (bridgeId) {
      const roleIds = getBridgeRoleIds(bridgeId);
      if (roleIds && roleIds.length > 0) {
        const roleSet = new Set(roleIds);
        tasks = tasks.filter((t) => t.role_id !== null && roleSet.has(t.role_id));
      }
    }
  }

  return c.json(tasks);
});

boardTasksRoute.post("/:boardId/tasks", zValidator("json", createTaskSchema), (c) => {
  const boardId = c.req.param("boardId");
  if (!q.getBoard(getDb(), boardId)) return c.json({ error: "board not found" }, 404);

  const { column_id, title, description } = c.req.valid("json");
  const column = q.getColumn(getDb(), column_id);
  if (!column || column.board_id !== boardId) {
    return c.json({ error: "column does not belong to this board" }, 400);
  }
  const task = q.createTask(getDb(), boardId, column_id, { title, description });
  // Refetch with relations so the event shape matches GET /tasks/:id
  const full = q.getTask(getDb(), task.id)!;
  bus.publish({ type: "task.created", data: { boardId, task: full } });
  return c.json(full, 201);
});

export const tasksRoute = new Hono();

/**
 * Cross-board task search/listing with location context. Empty query returns
 * the most recent tasks (limited); a non-empty query is run through SQLite
 * FTS5 ordered by rank. Filters compose with either path. Used by the MCP
 * `search_tasks` and `list_all_tasks` tools to avoid the boards→columns→tasks
 * walk that costs N tool calls per discovery.
 */
tasksRoute.get("/search", (c) => {
  const parsed = searchTasksQuerySchema.safeParse(c.req.query());
  if (!parsed.success) {
    return c.json({ error: parsed.error.message }, 400);
  }
  const results = q.searchTasks(getDb(), parsed.data);
  return c.json(results);
});

/**
 * Lite get_task variant — task + column + board without the role/prompts
 * bundle. Accepts either a slug (`pmt-46`) or the internal id (CUID),
 * matching the /bundle endpoint's behaviour. Slugs are detected via
 * `isSlugFormat`; non-matching strings are looked up as ids.
 *
 * Used by the UI's TaskRedirect view (the `/t/<id>` route) so external
 * links and agent-shareable references can carry either form.
 */
tasksRoute.get("/:idOrSlug/with-location", (c) => {
  const idOrSlug = c.req.param("idOrSlug");
  let canonicalId: string | null = null;
  if (q.isSlugFormat(idOrSlug)) {
    const bySlug = q.getTaskBySlug(getDb(), idOrSlug);
    canonicalId = bySlug?.id ?? null;
  } else {
    canonicalId = idOrSlug;
  }
  if (!canonicalId) return c.json({ error: "task not found" }, 404);
  const result = q.getTaskWithLocation(getDb(), canonicalId);
  if (!result) return c.json({ error: "task not found" }, 404);
  return c.json(result);
});

tasksRoute.get("/:id", (c) => {
  const task = q.getTask(getDb(), c.req.param("id"));
  if (!task) return c.json({ error: "task not found" }, 404);
  return c.json(task);
});

/**
 * Fully resolved task context — active role plus the deduplicated union of
 * prompts from all 6 origins (direct, role, column, column-role, board,
 * board-role). UI uses this for the inspector's "effective context" view;
 * MCP consumers get the same shape via the bundle endpoint below.
 */
tasksRoute.get("/:id/context", (c) => {
  const context = resolveTaskContext(getDb(), c.req.param("id"));
  if (!context) return c.json({ error: "task not found" }, 404);
  return c.json(context);
});

/**
 * Hardcoded id and name of the mandatory delegation protocol prompt.
 * If neither the id nor the name resolves to a prompt, injection is skipped
 * rather than failing the whole bundle — graceful degradation for DBs that
 * were created before this prompt was seeded.
 */
const DELEGATION_PROMPT_ID = "8oqIrb15DYuTyOfY2IDnH";
const DELEGATION_PROMPT_NAME = "delegation-protocol-mandatory";

/**
 * Returns the task's context bundle as XML (the exact string an agent would
 * paste into its system prompt). MCP's get_task_bundle tool proxies this
 * endpoint verbatim — it ships the agent XML rather than JSON wrapping XML.
 *
 * The path segment accepts either a slug (`pmt-46`) or the internal id
 * (CUID). Slug detection uses the format `^[a-z0-9-]{1,10}-\d+$`; if the
 * input matches, we resolve the slug to an id first, otherwise we treat
 * it as an id directly. Slugs are mutable (board moves re-slug them);
 * the internal id is the stable identifier — agents are encouraged to
 * persist ids, not slugs.
 *
 * When the resolved context has an active role, the delegation-protocol-
 * mandatory prompt is prepended at the top of the bundle as a system-level
 * MUST_FOLLOW instruction so the agent knows it must delegate to a
 * sub-agent.
 */
tasksRoute.get("/:idOrSlug/bundle", (c) => {
  const db = getDb();
  const idOrSlug = c.req.param("idOrSlug");
  // Resolve to a canonical id first — keeps the buildContextBundle call site
  // typed against TaskWithRelations without ternary-branch narrowing tricks.
  let canonicalId: string | null = null;
  if (q.isSlugFormat(idOrSlug)) {
    const bySlug = q.getTaskBySlug(db, idOrSlug);
    canonicalId = bySlug?.id ?? null;
  } else {
    canonicalId = idOrSlug;
  }
  if (!canonicalId) return c.json({ error: "task not found" }, 404);
  const full = q.getTask(db, canonicalId);
  if (!full) return c.json({ error: "task not found" }, 404);
  const context = resolveTaskContext(db, full.id);

  // Look up the delegation prompt only when the task has an active role —
  // tasks without one don't need the sub-agent reminder. Try id first
  // (fast path on the maintainer's DB), fall back to name (works on a
  // fresh install once the prompt is seeded; if neither resolves the
  // bundle still ships, just without the system-level injection).
  let delegationPrompt:
    | { name: string; content: string; short_description: string | null }
    | null = null;
  if (context?.role) {
    delegationPrompt =
      q.getPrompt(db, DELEGATION_PROMPT_ID) ??
      q.getPromptByName(db, DELEGATION_PROMPT_NAME) ??
      null;
  }

  const xml = buildContextBundle(full, context, delegationPrompt);
  return c.body(xml, 200, { "Content-Type": "application/xml; charset=utf-8" });
});

tasksRoute.patch("/:id", zValidator("json", updateTaskSchema), (c) => {
  const id = c.req.param("id");
  const input = c.req.valid("json");

  const existing = q.getTask(getDb(), id);
  if (!existing) return c.json({ error: "task not found" }, 404);

  if (input.column_id !== undefined) {
    const column = q.getColumn(getDb(), input.column_id);
    if (!column || column.board_id !== existing.board_id) {
      return c.json({ error: "column does not belong to this board" }, 400);
    }
  }

  const updated = q.updateTask(getDb(), id, input);
  if (!updated) return c.json({ error: "task not found" }, 404);
  const full = q.getTask(getDb(), id)!;
  bus.publish({
    type: "task.updated",
    data: { boardId: updated.board_id, taskId: updated.id, task: full },
  });
  return c.json(full);
});

tasksRoute.post("/:id/move", zValidator("json", moveTaskSchema), (c) => {
  const id = c.req.param("id");
  const { column_id, position } = c.req.valid("json");
  const existing = q.getTask(getDb(), id);
  if (!existing) return c.json({ error: "task not found" }, 404);
  const column = q.getColumn(getDb(), column_id);
  if (!column) return c.json({ error: "column not found" }, 404);
  // Capture the source location *before* the move so we can publish both
  // old and new board IDs. UI subscribers viewing the source board need
  // the old IDs to invalidate their stale list on cross-board moves.
  const oldBoardId = existing.board_id;
  const oldColumnId = existing.column_id;
  const moved = q.moveTask(getDb(), id, column_id, position);
  if (!moved) return c.json({ error: "task not found" }, 404);
  bus.publish({
    type: "task.moved",
    data: {
      taskId: moved.id,
      oldBoardId,
      newBoardId: moved.board_id,
      oldColumnId,
      newColumnId: column_id,
      position: moved.position,
    },
  });
  return c.json(q.getTask(getDb(), id));
});

tasksRoute.delete("/:id", (c) => {
  const id = c.req.param("id");
  const existing = q.getTask(getDb(), id);
  if (!existing) return c.json({ error: "task not found" }, 404);
  q.deleteTask(getDb(), id);
  bus.publish({ type: "task.deleted", data: { boardId: existing.board_id, taskId: id } });
  return c.json({ ok: true });
});

tasksRoute.put("/:id/role", zValidator("json", setTaskRoleSchema), (c) => {
  const id = c.req.param("id");
  const existing = q.getTask(getDb(), id);
  if (!existing) return c.json({ error: "task not found" }, 404);
  const { role_id } = c.req.valid("json");
  if (role_id && !q.getRole(getDb(), role_id)) {
    return c.json({ error: "role not found" }, 404);
  }
  q.setTaskRole(getDb(), id, role_id);
  const full = q.getTask(getDb(), id)!;
  bus.publish({
    type: "task.role_changed",
    data: { boardId: full.board_id, taskId: id, roleId: role_id, task: full },
  });
  return c.json(full);
});

tasksRoute.post("/:id/prompts", zValidator("json", addTaskPromptSchema), (c) => {
  const taskId = c.req.param("id");
  const { prompt_id } = c.req.valid("json");
  if (!q.getTask(getDb(), taskId)) return c.json({ error: "task not found" }, 404);
  if (!q.getPrompt(getDb(), prompt_id)) return c.json({ error: "prompt not found" }, 404);
  q.addTaskPrompt(getDb(), taskId, prompt_id, "direct");
  const full = q.getTask(getDb(), taskId)!;
  bus.publish({
    type: "task.prompt_added",
    data: { boardId: full.board_id, taskId, promptId: prompt_id, task: full },
  });
  return c.json(full, 201);
});

tasksRoute.delete("/:id/prompts/:promptId", (c) => {
  const taskId = c.req.param("id");
  const promptId = c.req.param("promptId");
  if (!q.getTask(getDb(), taskId)) return c.json({ error: "task not found" }, 404);
  const origin = q.getTaskPromptOrigin(getDb(), taskId, promptId);
  if (origin === null) return c.json({ error: "prompt was not attached to task" }, 404);
  if (origin !== "direct") {
    return c.json(
      { error: "Cannot remove role-inherited items. Remove the role instead." },
      403
    );
  }
  q.removeTaskPrompt(getDb(), taskId, promptId);
  const full = q.getTask(getDb(), taskId)!;
  bus.publish({
    type: "task.prompt_removed",
    data: { boardId: full.board_id, taskId, promptId, task: full },
  });
  return c.json(full);
});

tasksRoute.post("/:id/skills", zValidator("json", addTaskSkillSchema), (c) => {
  const taskId = c.req.param("id");
  const { skill_id } = c.req.valid("json");
  if (!q.getTask(getDb(), taskId)) return c.json({ error: "task not found" }, 404);
  if (!q.getSkill(getDb(), skill_id)) return c.json({ error: "skill not found" }, 404);
  q.addTaskSkill(getDb(), taskId, skill_id, "direct");
  const full = q.getTask(getDb(), taskId)!;
  bus.publish({
    type: "task.skill_added",
    data: { boardId: full.board_id, taskId, skillId: skill_id, task: full },
  });
  return c.json(full, 201);
});

tasksRoute.delete("/:id/skills/:skillId", (c) => {
  const taskId = c.req.param("id");
  const skillId = c.req.param("skillId");
  if (!q.getTask(getDb(), taskId)) return c.json({ error: "task not found" }, 404);
  const origin = q.getTaskSkillOrigin(getDb(), taskId, skillId);
  if (origin === null) return c.json({ error: "skill was not attached to task" }, 404);
  if (origin !== "direct") {
    return c.json(
      { error: "Cannot remove role-inherited items. Remove the role instead." },
      403
    );
  }
  q.removeTaskSkill(getDb(), taskId, skillId);
  const full = q.getTask(getDb(), taskId)!;
  bus.publish({
    type: "task.skill_removed",
    data: { boardId: full.board_id, taskId, skillId, task: full },
  });
  return c.json(full);
});

tasksRoute.post("/:id/mcp_tools", zValidator("json", addTaskMcpToolSchema), (c) => {
  const taskId = c.req.param("id");
  const { mcp_tool_id } = c.req.valid("json");
  if (!q.getTask(getDb(), taskId)) return c.json({ error: "task not found" }, 404);
  if (!q.getMcpTool(getDb(), mcp_tool_id)) return c.json({ error: "mcp tool not found" }, 404);
  q.addTaskMcpTool(getDb(), taskId, mcp_tool_id, "direct");
  const full = q.getTask(getDb(), taskId)!;
  bus.publish({
    type: "task.mcp_tool_added",
    data: { boardId: full.board_id, taskId, mcpToolId: mcp_tool_id, task: full },
  });
  return c.json(full, 201);
});

tasksRoute.delete("/:id/mcp_tools/:mcpToolId", (c) => {
  const taskId = c.req.param("id");
  const mcpToolId = c.req.param("mcpToolId");
  if (!q.getTask(getDb(), taskId)) return c.json({ error: "task not found" }, 404);
  const origin = q.getTaskMcpToolOrigin(getDb(), taskId, mcpToolId);
  if (origin === null) return c.json({ error: "mcp tool was not attached to task" }, 404);
  if (origin !== "direct") {
    return c.json(
      { error: "Cannot remove role-inherited items. Remove the role instead." },
      403
    );
  }
  q.removeTaskMcpTool(getDb(), taskId, mcpToolId);
  const full = q.getTask(getDb(), taskId)!;
  bus.publish({
    type: "task.mcp_tool_removed",
    data: { boardId: full.board_id, taskId, mcpToolId, task: full },
  });
  return c.json(full);
});

export default tasksRoute;
