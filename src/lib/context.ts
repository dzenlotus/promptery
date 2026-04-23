import type { TaskWithRelations } from "../db/queries/tasks.js";
import type { TaskPrompt } from "../db/queries/taskPrompts.js";
import type { TaskSkill } from "../db/queries/taskSkills.js";
import type { TaskMcpTool } from "../db/queries/taskMcpTools.js";

/**
 * Renders a task's full agent context as an XML-tagged string.
 *
 * The bundle splits into two top-level sections so an agent can distinguish
 * "who I am" (role identity + role-provided primitives) from "what I'm doing"
 * (the task description + any direct attachments specific to this task).
 *
 * Empty sections are omitted entirely — never emit `<prompts></prompts>` —
 * because empty containers add noise without information.
 */
export function buildContextBundle(task: TaskWithRelations): string {
  const parts: string[] = [];
  const roleSection = renderRoleSection(task);
  if (roleSection) parts.push(roleSection);
  parts.push(renderTaskSection(task));
  return parts.join("\n\n");
}

function renderRoleSection(task: TaskWithRelations): string | null {
  if (!task.role) return null;
  const role = task.role;
  const roleOrigin = `role:${role.id}`;

  const inheritedPrompts = task.prompts.filter((p) => p.origin === roleOrigin);
  const inheritedSkills = task.skills.filter((s) => s.origin === roleOrigin);
  const inheritedMcp = task.mcp_tools.filter((m) => m.origin === roleOrigin);

  const inner: string[] = [];
  if (role.content.trim().length > 0) {
    inner.push(indent(wrapText("description", null, role.content), 1));
  }
  if (inheritedPrompts.length > 0) {
    inner.push(indent(renderPrimitiveGroup("prompts", "prompt", inheritedPrompts), 1));
  }
  if (inheritedSkills.length > 0) {
    inner.push(indent(renderPrimitiveGroup("skills", "skill", inheritedSkills), 1));
  }
  if (inheritedMcp.length > 0) {
    inner.push(indent(renderPrimitiveGroup("mcp_tools", "mcp_tool", inheritedMcp), 1));
  }

  return wrapElements("role", { name: role.name }, inner.join("\n\n"));
}

function renderTaskSection(task: TaskWithRelations): string {
  const direct = {
    prompts: task.prompts.filter((p) => p.origin === "direct"),
    skills: task.skills.filter((s) => s.origin === "direct"),
    mcp_tools: task.mcp_tools.filter((m) => m.origin === "direct"),
  };

  const inner: string[] = [];
  if (task.description.trim().length > 0) {
    inner.push(indent(wrapText("description", null, task.description), 1));
  }
  if (direct.prompts.length > 0) {
    inner.push(indent(renderPrimitiveGroup("direct_prompts", "prompt", direct.prompts), 1));
  }
  if (direct.skills.length > 0) {
    inner.push(indent(renderPrimitiveGroup("direct_skills", "skill", direct.skills), 1));
  }
  if (direct.mcp_tools.length > 0) {
    inner.push(
      indent(renderPrimitiveGroup("direct_mcp_tools", "mcp_tool", direct.mcp_tools), 1)
    );
  }

  return wrapElements(
    "task",
    { id: String(task.number), title: task.title },
    inner.join("\n\n")
  );
}

type PrimitiveLike = Pick<TaskPrompt | TaskSkill | TaskMcpTool, "name" | "content">;

function renderPrimitiveGroup(
  groupTag: string,
  itemTag: string,
  items: PrimitiveLike[]
): string {
  const rendered = items
    .map((item) => indent(wrapText(itemTag, { name: item.name }, item.content), 1))
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
