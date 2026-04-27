import type { ToolDefinition } from "./index.js";

const REPORT_KIND_LIST = [
  "investigation",
  "analysis",
  "plan",
  "summary",
  "review",
  "memo",
] as const;

/**
 * Save a typed, persistent, searchable artefact attached to a task. The
 * description is intentionally explicit: agents that finish an
 * investigation, draft a plan, or write a memo should land it here rather
 * than appending to `task.description`. Reports stay out of the task body
 * so the task remains a thin coordination handle, while the report itself
 * is FTS-indexed across the workspace and survives task edits unchanged.
 */
export const create_agent_report: ToolDefinition = {
  name: "create_agent_report",
  description:
    "Save a typed, persistent report on a task — investigation results, " +
    "analyses, plans, summaries, reviews, or memos. USE THIS instead of " +
    "appending to task.description. Reports are first-class artefacts: " +
    "FTS-searchable across the workspace, retrievable by id, and they don't " +
    "bloat the task body. Returns the created report (id, kind, title, " +
    "content, author, timestamps).",
  inputSchema: {
    type: "object",
    properties: {
      task_id: { type: "string", description: "Target task id." },
      kind: {
        type: "string",
        enum: [...REPORT_KIND_LIST],
        description:
          "One of: investigation | analysis | plan | summary | review | memo. " +
          "Pick the closest fit; UI badges and filters key off this value.",
      },
      title: {
        type: "string",
        description:
          "Short headline (max ~200 chars). Shown in the task's Reports list " +
          "and in search results.",
      },
      content: {
        type: "string",
        description:
          "Body of the report — markdown. This is the searchable corpus.",
      },
    },
    required: ["task_id", "kind", "title", "content"],
    additionalProperties: false,
  },
  handler: async (args, { hub }) =>
    hub.post(`/api/tasks/${args.task_id as string}/reports`, {
      kind: args.kind as string,
      title: args.title as string,
      content: args.content as string,
    }),
};

export const list_agent_reports: ToolDefinition = {
  name: "list_agent_reports",
  description:
    "List agent reports for a task, optionally filtered by kind. Returns " +
    "reports ordered by created_at DESC. Cheap fan-out for browsing what's " +
    "already been written about a task before starting fresh work.",
  inputSchema: {
    type: "object",
    properties: {
      task_id: { type: "string", description: "Target task id." },
      kind: {
        type: "string",
        enum: [...REPORT_KIND_LIST],
        description: "Optional — restrict to a single kind.",
      },
    },
    required: ["task_id"],
    additionalProperties: false,
  },
  handler: async (args, { hub }) => {
    const path =
      typeof args.kind === "string"
        ? `/api/tasks/${args.task_id as string}/reports?kind=${encodeURIComponent(args.kind)}`
        : `/api/tasks/${args.task_id as string}/reports`;
    return hub.get(path);
  },
};

export const get_agent_report: ToolDefinition = {
  name: "get_agent_report",
  description:
    "Fetch one agent report by id — full content + metadata. Use this when " +
    "you have an id from list_agent_reports or search_agent_reports and need " +
    "the body text.",
  inputSchema: {
    type: "object",
    properties: { id: { type: "string" } },
    required: ["id"],
    additionalProperties: false,
  },
  handler: async (args, { hub }) => hub.get(`/api/reports/${args.id as string}`),
};

export const search_agent_reports: ToolDefinition = {
  name: "search_agent_reports",
  description:
    "Full-text search across agent reports (title + content) workspace-wide " +
    "via SQLite FTS5. Returns hits ranked by relevance, each with the " +
    "originating task's id / title / board so you can deep-link back. " +
    "Empty query is rejected — call list_agent_reports for a task-scoped " +
    "browse instead.",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Text to match against title + content.",
      },
      limit: {
        type: "number",
        description: "Max results (default 20, max 200).",
      },
    },
    required: ["query"],
    additionalProperties: false,
  },
  handler: async (args, { hub }) => {
    const params = new URLSearchParams();
    params.set("q", args.query as string);
    if (typeof args.limit === "number") params.set("limit", String(args.limit));
    return hub.get(`/api/reports/search?${params.toString()}`);
  },
};
