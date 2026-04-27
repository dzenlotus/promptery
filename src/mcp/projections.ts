/**
 * MCP minimal-shape projections.
 *
 * The bridge layer projects HTTP responses down to a small shape before
 * returning them to the agent. Goals:
 *
 *  - Every read tool except `get_task_bundle` returns navigation data only —
 *    ids, names, slugs, positions, child id arrays. No `description`, no
 *    role content, no prompt content. The agent fetches the heavy fields
 *    by id when it actually needs them (`get_task_bundle` for task XML,
 *    `get_prompt` for a single prompt's body, etc.).
 *
 *  - Every write tool returns `{id, ...minimal_changed_fields}` — usually
 *    50–200 bytes. Enough for the agent to confirm the change took effect
 *    without burning context on the full entity.
 *
 *  - The HTTP API stays unchanged: the UI depends on full entity shapes
 *    for optimistic updates. Only this bridge layer projects.
 *
 * Each helper takes the full upstream payload (which already exists on
 * the HTTP side and isn't worth re-typing here) and returns the projected
 * shape. Type ergonomics — the inputs are typed as `unknown`/loose maps
 * because they originate from JSON; static guarantees come from the HTTP
 * layer's schemas, not from re-asserting them here.
 */

interface MinimalEntity {
  [key: string]: unknown;
}

/** A small set of properties from `obj` (skipping undefined ones). */
function pick<K extends string>(
  obj: Record<string, unknown>,
  keys: readonly K[]
): MinimalEntity {
  const out: MinimalEntity = {};
  for (const k of keys) {
    if (obj[k] !== undefined) out[k] = obj[k];
  }
  return out;
}

// ── Spaces ────────────────────────────────────────────────────────────────

const SPACE_LIST_KEYS = ["id", "name", "prefix", "is_default", "position"] as const;

export function projectSpaceList(spaces: unknown): MinimalEntity[] {
  if (!Array.isArray(spaces)) return [];
  return spaces.map((s) => pick(s as Record<string, unknown>, SPACE_LIST_KEYS));
}

const SPACE_DETAIL_KEYS = [
  "id",
  "name",
  "prefix",
  "description",
  "is_default",
  "position",
  "board_ids",
] as const;

export function projectSpaceDetail(space: unknown): MinimalEntity {
  return pick(space as Record<string, unknown>, SPACE_DETAIL_KEYS);
}

// ── Boards ────────────────────────────────────────────────────────────────

const BOARD_LIST_KEYS = ["id", "name", "space_id"] as const;

export function projectBoardList(boards: unknown): MinimalEntity[] {
  if (!Array.isArray(boards)) return [];
  return boards.map((b) =>
    pick(b as Record<string, unknown>, BOARD_LIST_KEYS)
  );
}

/**
 * Detail shape: id + name + space_id + role_id (just the id; full role
 * comes from get_role) + column_ids array. No prompts content, no role
 * content. Agents that need the full role hit get_role(role_id).
 */
export function projectBoardDetail(board: unknown, columns: unknown): MinimalEntity {
  const b = (board ?? {}) as Record<string, unknown>;
  const cols = Array.isArray(columns) ? columns : [];
  return {
    ...pick(b, ["id", "name", "space_id", "role_id"]),
    column_ids: cols
      .map((c) => (c as Record<string, unknown>).id)
      .filter((id): id is string => typeof id === "string"),
  };
}

// ── Columns ───────────────────────────────────────────────────────────────

const COLUMN_LIST_KEYS = ["id", "name", "position", "board_id", "role_id"] as const;

export function projectColumnList(columns: unknown): MinimalEntity[] {
  if (!Array.isArray(columns)) return [];
  return columns.map((c) =>
    pick(c as Record<string, unknown>, COLUMN_LIST_KEYS)
  );
}

// ── Tasks ─────────────────────────────────────────────────────────────────

const TASK_LIST_KEYS = [
  "id",
  "slug",
  "title",
  "column_id",
  "board_id",
  "position",
  "role_id",
] as const;

export function projectTaskList(tasks: unknown): MinimalEntity[] {
  if (!Array.isArray(tasks)) return [];
  return tasks.map((t) => pick(t as Record<string, unknown>, TASK_LIST_KEYS));
}

/**
 * Search/list-with-location envelope: minimal task fields + minimal column
 * + minimal board, optionally a snippet of the description for search hits
 * (the HTTP layer can attach `snippet` on its way through).
 */
export function projectTaskWithLocation(hit: unknown): MinimalEntity {
  const h = (hit ?? {}) as Record<string, unknown>;
  const task = (h.task ?? {}) as Record<string, unknown>;
  const column = (h.column ?? {}) as Record<string, unknown>;
  const board = (h.board ?? {}) as Record<string, unknown>;
  return {
    task: pick(task, TASK_LIST_KEYS),
    column: pick(column, ["id", "name", "position"]),
    board: pick(board, ["id", "name"]),
    ...(typeof h.snippet === "string" ? { snippet: h.snippet } : {}),
    ...(typeof h.match_type === "string" ? { match_type: h.match_type } : {}),
  };
}

export function projectTaskWithLocationList(hits: unknown): MinimalEntity[] {
  if (!Array.isArray(hits)) return [];
  return hits.map(projectTaskWithLocation);
}

/**
 * Detail shape for `get_task`: minimal task fields + minimal location, no
 * full role / prompts / skills / mcp_tools. Agents who need those hit
 * `get_task_bundle` (for XML system prompt) or `get_role` / `get_prompt`
 * by id from the link arrays.
 */
export function projectTaskDetail(taskWithLocation: unknown): MinimalEntity {
  return projectTaskWithLocation(taskWithLocation);
}

// ── Roles ─────────────────────────────────────────────────────────────────

const ROLE_LIST_KEYS = ["id", "name", "color"] as const;

export function projectRoleList(roles: unknown): MinimalEntity[] {
  if (!Array.isArray(roles)) return [];
  return roles.map((r) => pick(r as Record<string, unknown>, ROLE_LIST_KEYS));
}

/**
 * Detail shape: identity + content (the role's own body — its identity)
 * plus prompt_ids / skill_ids / mcp_tool_ids. The full prompts/skills/
 * mcp_tools are not embedded; the agent fetches each by id if needed.
 */
export function projectRoleDetail(role: unknown): MinimalEntity {
  const r = (role ?? {}) as Record<string, unknown>;
  const prompts = Array.isArray(r.prompts) ? r.prompts : [];
  const skills = Array.isArray(r.skills) ? r.skills : [];
  const mcpTools = Array.isArray(r.mcp_tools) ? r.mcp_tools : [];
  return {
    ...pick(r, ["id", "name", "content", "color"]),
    prompt_ids: prompts
      .map((p) => (p as Record<string, unknown>).id)
      .filter((id): id is string => typeof id === "string"),
    skill_ids: skills
      .map((s) => (s as Record<string, unknown>).id)
      .filter((id): id is string => typeof id === "string"),
    mcp_tool_ids: mcpTools
      .map((m) => (m as Record<string, unknown>).id)
      .filter((id): id is string => typeof id === "string"),
  };
}

// ── Prompts ───────────────────────────────────────────────────────────────

const PROMPT_LIST_KEYS = ["id", "name", "color"] as const;

export function projectPromptList(prompts: unknown): MinimalEntity[] {
  if (!Array.isArray(prompts)) return [];
  return prompts.map((p) => pick(p as Record<string, unknown>, PROMPT_LIST_KEYS));
}

/**
 * `get_prompt` is the one read tool where the heavy field stays. A
 * single-prompt fetch IS the minimal way to retrieve a prompt's body —
 * you opted in by id.
 */
export function projectPromptDetail(prompt: unknown): MinimalEntity {
  return pick(prompt as Record<string, unknown>, [
    "id",
    "name",
    "content",
    "color",
  ]);
}

// ── Prompt groups ─────────────────────────────────────────────────────────

const GROUP_LIST_KEYS = ["id", "name", "color", "position", "prompt_count"] as const;

export function projectPromptGroupList(groups: unknown): MinimalEntity[] {
  if (!Array.isArray(groups)) return [];
  return groups.map((g) =>
    pick(g as Record<string, unknown>, GROUP_LIST_KEYS)
  );
}

/**
 * Detail shape: group identity + ordered prompt_ids array. Agents that
 * need the full prompts iterate over prompt_ids and call get_prompt per
 * id (or list_prompts once if they want everything).
 */
export function projectPromptGroupDetail(group: unknown): MinimalEntity {
  const g = (group ?? {}) as Record<string, unknown>;
  const prompts = Array.isArray(g.prompts) ? g.prompts : [];
  return {
    ...pick(g, ["id", "name", "color", "position"]),
    prompt_ids: prompts
      .map((p) => (p as Record<string, unknown>).id)
      .filter((id): id is string => typeof id === "string"),
  };
}

// ── Tags ──────────────────────────────────────────────────────────────────

const TAG_LIST_KEYS = ["id", "name", "color", "prompt_count"] as const;

export function projectTagList(tags: unknown): MinimalEntity[] {
  if (!Array.isArray(tags)) return [];
  return tags.map((t) => pick(t as Record<string, unknown>, TAG_LIST_KEYS));
}

/**
 * Detail shape: tag identity + prompt_ids array (alphabetical). Agents
 * who need full prompt bodies iterate prompt_ids and call get_prompt.
 */
export function projectTagDetail(tag: unknown): MinimalEntity {
  const t = (tag ?? {}) as Record<string, unknown>;
  const prompts = Array.isArray(t.prompts) ? t.prompts : [];
  return {
    ...pick(t, ["id", "name", "color"]),
    prompt_ids: prompts
      .map((p) => (p as Record<string, unknown>).id)
      .filter((id): id is string => typeof id === "string"),
  };
}

// ── Generic helpers ───────────────────────────────────────────────────────

/**
 * Confirmation envelope for write tools: `{id, ...changed}`. The agent
 * gets enough to verify the change without re-fetching the full entity.
 */
export function confirmation(
  id: string,
  changed: Record<string, unknown> = {}
): MinimalEntity {
  return { id, ...changed };
}

/**
 * Generic delete confirmation: `{id, deleted: true}`. The flag is
 * explicit so the agent doesn't have to parse a status code.
 */
export function deleted(id: string): MinimalEntity {
  return { id, deleted: true };
}
