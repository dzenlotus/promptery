import type { TaskWithRelations } from "../db/queries/tasks.js";
import type { TaskSkill } from "../db/queries/taskSkills.js";
import type { TaskMcpTool } from "../db/queries/taskMcpTools.js";
import type {
  ResolvedPrompt,
  ResolvedRole,
  ResolvedTaskContext,
} from "../db/inheritance/types.js";

/**
 * System prompt injected at the top of every bundle that has an active role.
 * Tells the agent it must delegate work to a sub-agent (the mandatory
 * delegation protocol). Only present when the bundle has a `<role>` element.
 */
export interface SystemPromptEntry {
  name: string;
  content: string;
  short_description?: string | null;
}

/**
 * Renders a task's full agent context as an XML-tagged string.
 *
 * With the inheritance layer (stage 8.1) prompts can come from up to six
 * origins, so the caller passes the resolved context computed by
 * `resolveTaskContext`. When it's omitted we synthesise a minimal context
 * from `task.role` and `task.prompts` (origin marked `role:<id>` or
 * `direct`), which keeps the old behaviour for callers that haven't wired
 * the resolver in yet.
 *
 * The bundle splits into two top-level sections:
 *   - `<system_prompts>` — MUST_FOLLOW system-level prompt injected when the
 *     bundle has an active role (the delegation protocol); omitted otherwise
 *   - `<role>` — identity + everything inherited from the active role
 *     (role prompts, role skills, role MCP tools)
 *   - `<task>` — description + direct attachments specific to this task
 *   - `<inherited>` — prompts pulled from board / column / their roles when
 *     present; collapses to nothing if the task lives on a board with no
 *     inherited prompts configured
 *
 * Empty sections are omitted entirely — never emit `<prompts></prompts>` —
 * because empty containers add noise without information.
 */
export function buildContextBundle(
  task: TaskWithRelations,
  context?: ResolvedTaskContext | null,
  systemPrompt?: SystemPromptEntry | null
): string {
  const ctx = context ?? synthesiseFromTask(task);

  const parts: string[] = [];

  // When a role is active and a system prompt is provided, inject it at the
  // very top of the bundle as a mandatory delegation instruction.
  if (ctx.role && systemPrompt) {
    parts.push(indent(renderSystemPromptsSection(systemPrompt), 1));
  }

  const roleSection = renderRoleSection(task, ctx);
  if (roleSection) parts.push(indent(roleSection, 1));
  parts.push(indent(renderTaskSection(task, ctx), 1));
  const inheritedSection = renderInheritedSection(ctx);
  if (inheritedSection) parts.push(indent(inheritedSection, 1));
  return wrapElements("context", null, parts.join("\n\n"));
}

/**
 * Renders the `<system_prompts>` block containing the delegation protocol
 * prompt with `priority="MUST_FOLLOW"` and `origin="system"` attributes.
 * Only included when the bundle has an active role.
 */
function renderSystemPromptsSection(prompt: SystemPromptEntry): string {
  const attrs: Record<string, string> = {
    name: prompt.name,
    origin: "system",
    priority: "MUST_FOLLOW",
  };
  if (prompt.short_description) attrs.desc = prompt.short_description;
  const inner = indent(wrapText("prompt", attrs, prompt.content), 1);
  return wrapElements("system_prompts", null, inner);
}

function synthesiseFromTask(task: TaskWithRelations): ResolvedTaskContext {
  const role: ResolvedRole | null = task.role
    ? {
        id: task.role.id,
        name: task.role.name,
        content: task.role.content,
        color: task.role.color ?? null,
        source: "task",
      }
    : null;

  const prompts: ResolvedPrompt[] = task.prompts.map((p) => {
    const isRoleInherited = p.origin.startsWith("role:");
    const base: ResolvedPrompt = {
      id: p.id,
      name: p.name,
      content: p.content,
      color: p.color ?? null,
      short_description: p.short_description ?? null,
      token_count: p.token_count,
      origin: isRoleInherited ? "role" : "direct",
    };
    // Keep a source pointer when the origin carries one so the role-section
    // renderer can match prompts to the active role without re-joining.
    if (isRoleInherited && role) {
      base.source = { type: "role", id: role.id, name: role.name };
    }
    return base;
  });

  const total_token_count = prompts.reduce((sum, p) => sum + p.token_count, 0);
  return { task_id: task.id, role, prompts, total_token_count };
}

function renderRoleSection(
  task: TaskWithRelations,
  ctx: ResolvedTaskContext
): string | null {
  const role = ctx.role;
  if (!role) return null;

  // Prompts inherited *from* this active role — origin "role" carrying the
  // same role id, or any prompt whose source points at this role.
  const rolePrompts = ctx.prompts.filter(
    (p) =>
      (p.origin === "role" || p.origin === "column-role" || p.origin === "board-role") &&
      p.source?.id === role.id
  );

  // Skills / MCP tools still flow through the legacy task_* tables tagged
  // with `role:<id>` origin — they're outside the inheritance stage for now.
  const roleOriginTag = `role:${role.id}`;
  const inheritedSkills = task.skills.filter((s) => s.origin === roleOriginTag);
  const inheritedMcp = task.mcp_tools.filter((m) => m.origin === roleOriginTag);

  const inner: string[] = [];
  if (role.content.trim().length > 0) {
    inner.push(indent(wrapText("description", null, role.content), 1));
  }
  if (rolePrompts.length > 0) {
    inner.push(
      indent(
        renderPrimitiveGroup(
          "prompts",
          "prompt",
          rolePrompts.map((p) => ({ name: p.name, content: p.content, short_description: p.short_description ?? null }))
        ),
        1
      )
    );
  }
  if (inheritedSkills.length > 0) {
    inner.push(indent(renderPrimitiveGroup("skills", "skill", inheritedSkills), 1));
  }
  if (inheritedMcp.length > 0) {
    inner.push(indent(renderPrimitiveGroup("mcp_tools", "mcp_tool", inheritedMcp), 1));
  }

  return wrapElements("role", { name: role.name }, inner.join("\n\n"));
}

function renderTaskSection(
  task: TaskWithRelations,
  ctx: ResolvedTaskContext
): string {
  const directPrompts = ctx.prompts.filter((p) => p.origin === "direct");
  const directSkills: TaskSkill[] = task.skills.filter((s) => s.origin === "direct");
  const directMcp: TaskMcpTool[] = task.mcp_tools.filter((m) => m.origin === "direct");

  const inner: string[] = [];
  if (task.description.trim().length > 0) {
    inner.push(indent(wrapText("description", null, task.description), 1));
  }
  if (directPrompts.length > 0) {
    inner.push(
      indent(
        renderPrimitiveGroup(
          "direct_prompts",
          "prompt",
          directPrompts.map((p) => ({ name: p.name, content: p.content, short_description: p.short_description ?? null }))
        ),
        1
      )
    );
  }
  if (directSkills.length > 0) {
    inner.push(indent(renderPrimitiveGroup("direct_skills", "skill", directSkills), 1));
  }
  if (directMcp.length > 0) {
    inner.push(
      indent(renderPrimitiveGroup("direct_mcp_tools", "mcp_tool", directMcp), 1)
    );
  }

  return wrapElements(
    "task",
    { id: task.slug, title: task.title },
    inner.join("\n\n")
  );
}

/**
 * Prompts pulled from board-level and column-level sources (direct or via
 * their roles). Rendered as a sibling of `<task>` so agents can tell
 * workspace-wide context from task-specific identity.
 *
 * Prompts that belong to the active role are deliberately excluded here —
 * `renderRoleSection` already emits them under `<role><prompts>`. Without
 * this filter, a board-role whose role IS the active role shows up twice
 * (once in `<role>`, once in `<inherited><board_role_prompts>`), doubling
 * the XML size for the common "board supplies the active role" case.
 */
function renderInheritedSection(ctx: ResolvedTaskContext): string | null {
  const activeRoleId = ctx.role?.id;
  const isActiveRolePrompt = (p: ResolvedPrompt): boolean =>
    activeRoleId !== undefined && p.source?.id === activeRoleId;

  const boardPrompts = ctx.prompts.filter((p) => p.origin === "board");
  const boardRolePrompts = ctx.prompts.filter(
    (p) => p.origin === "board-role" && !isActiveRolePrompt(p)
  );
  const columnPrompts = ctx.prompts.filter((p) => p.origin === "column");
  const columnRolePrompts = ctx.prompts.filter(
    (p) => p.origin === "column-role" && !isActiveRolePrompt(p)
  );

  const groups: string[] = [];
  if (boardPrompts.length > 0) {
    groups.push(
      indent(
        renderPrimitiveGroup(
          "board_prompts",
          "prompt",
          boardPrompts.map((p) => ({ name: p.name, content: p.content, short_description: p.short_description ?? null }))
        ),
        1
      )
    );
  }
  if (boardRolePrompts.length > 0) {
    groups.push(
      indent(
        renderPrimitiveGroup(
          "board_role_prompts",
          "prompt",
          boardRolePrompts.map((p) => ({ name: p.name, content: p.content, short_description: p.short_description ?? null }))
        ),
        1
      )
    );
  }
  if (columnPrompts.length > 0) {
    groups.push(
      indent(
        renderPrimitiveGroup(
          "column_prompts",
          "prompt",
          columnPrompts.map((p) => ({ name: p.name, content: p.content, short_description: p.short_description ?? null }))
        ),
        1
      )
    );
  }
  if (columnRolePrompts.length > 0) {
    groups.push(
      indent(
        renderPrimitiveGroup(
          "column_role_prompts",
          "prompt",
          columnRolePrompts.map((p) => ({ name: p.name, content: p.content, short_description: p.short_description ?? null }))
        ),
        1
      )
    );
  }

  if (groups.length === 0) return null;
  return wrapElements("inherited", null, groups.join("\n\n"));
}

interface PrimitiveLike {
  name: string;
  content: string;
  short_description?: string | null;
}

function renderPrimitiveGroup(
  groupTag: string,
  itemTag: string,
  items: PrimitiveLike[]
): string {
  const rendered = items
    .map((item) => {
      const attrs: Record<string, string> = { name: item.name };
      if (item.short_description) attrs.desc = item.short_description;
      return indent(wrapText(itemTag, attrs, item.content), 1);
    })
    .join("\n");
  return wrapElements(groupTag, null, rendered);
}

/**
 * Wraps a markdown/free-text body — escapes `&` and `<` so the markdown can't
 * accidentally produce bad XML. Empty bodies collapse to a self-contained
 * `<tag></tag>` so callers can decide separately whether to omit them.
 */
function wrapText(
  tag: string,
  attrs: Record<string, string> | null,
  body: string
): string {
  const open = openTag(tag, attrs);
  const close = `</${tag}>`;
  if (body.length === 0) return `${open}${close}`;
  return `${open}\n${escapeText(body).trim()}\n${close}`;
}

/**
 * Wraps a body that already contains rendered XML elements — does NOT escape.
 * Body is expected to be pre-formatted with its own indentation.
 */
function wrapElements(
  tag: string,
  attrs: Record<string, string> | null,
  body: string
): string {
  const open = openTag(tag, attrs);
  const close = `</${tag}>`;
  if (body.length === 0) return `${open}${close}`;
  return `${open}\n${body}\n${close}`;
}

function openTag(tag: string, attrs: Record<string, string> | null): string {
  return `<${tag}${attrs ? attrsToString(attrs) : ""}>`;
}

function attrsToString(attrs: Record<string, string>): string {
  return Object.entries(attrs)
    .map(([k, v]) => ` ${k}="${escapeAttr(v)}"`)
    .join("");
}

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Conservative text escaping: only `&` and `<` are guaranteed to break XML
 * parsing. We leave the rest of the markdown alone so quoted backticks,
 * apostrophes, and `>` blockquotes survive.
 */
function escapeText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
}

function indent(s: string, level: number): string {
  const pad = "  ".repeat(level);
  return s
    .split("\n")
    .map((line) => (line.length === 0 ? line : pad + line))
    .join("\n");
}
