export interface Space {
  id: string;
  name: string;
  prefix: string;
  description: string | null;
  is_default: boolean;
  position: number;
  created_at: number;
  updated_at: number;
}

export interface SpaceWithBoards extends Space {
  /** Ordered list of board ids contained in this space (created_at ASC). */
  board_ids: string[];
}

export interface MoveBoardToSpaceResult {
  board_id: string;
  space_id: string;
  reslugged_count: number;
}

export interface Board {
  id: string;
  name: string;
  space_id: string;
  role_id: string | null;
  /** Per-space ordinal that drives the sidebar order. */
  position: number;
  created_at: number;
  updated_at: number;
}

export interface BoardWithRelations extends Board {
  role: Role | null;
  prompts: Prompt[];
}

export interface Column {
  id: string;
  board_id: string;
  name: string;
  position: number;
  role_id: string | null;
  created_at: number;
}

export interface ColumnWithRelations extends Column {
  role: Role | null;
  prompts: Prompt[];
}

export interface Prompt {
  id: string;
  name: string;
  content: string;
  color: string;
  /** Tooltip text on hover; null when not set. Optional in the type so
   *  existing fixtures and Role/Skill/McpTool aliases (which don't
   *  surface this field in the UI today) keep compiling. */
  short_description?: string | null;
  /** Cached cl100k_base token count of `content`. Re-computed on every
   *  prompt write — sidebars / dialogs surface it via `<TokenBadge />`. */
  token_count?: number;
  created_at: number;
  updated_at: number;
}

export type Skill = Prompt;
export type McpTool = Prompt;
// Role lives in its own table — it has no token_count column itself; the
// surfaced badge sums over `prompts` (see RoleWithRelations.token_count).
export interface Role {
  id: string;
  name: string;
  content: string;
  color: string;
  created_at: number;
  updated_at: number;
}

export interface RoleWithRelations extends Role {
  prompts: Prompt[];
  skills: Skill[];
  mcp_tools: McpTool[];
  /** Sum of `token_count` across the role's default prompts. Server-side
   *  computed so the badge has no work to do. */
  token_count?: number;
}

/** Origin marker: "direct" when user attached it, "role:<id>" when inherited. */
export type LinkOrigin = "direct" | `role:${string}`;

export interface TaskLinkedPrompt extends Prompt {
  origin: LinkOrigin;
}
export interface TaskLinkedSkill extends Skill {
  origin: LinkOrigin;
}
export interface TaskLinkedMcpTool extends McpTool {
  origin: LinkOrigin;
}

export interface Task {
  id: string;
  board_id: string;
  column_id: string;
  /**
   * Human-friendly identifier (e.g. `pmt-46`) derived from the board's
   * space prefix. Slugs are mutable across `move_board_to_space`; the
   * internal `id` is the stable identifier.
   */
  slug: string;
  title: string;
  description: string;
  position: number;
  role_id: string | null;
  role: Role | null;
  prompts: TaskLinkedPrompt[];
  skills: TaskLinkedSkill[];
  mcp_tools: TaskLinkedMcpTool[];
  /**
   * Prompt ids the user explicitly disabled for this task via per-task
   * overrides. The corresponding inherited chip is rendered greyed-out and
   * the resolver suppresses the prompt from the effective context. Empty
   * array when no overrides are set. Optional for backward compatibility
   * with older servers that predate this field.
   */
  disabled_prompts?: string[];
  created_at: number;
  updated_at: number;
}

export interface CreateTaskInput {
  column_id: string;
  title: string;
  description?: string;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string;
  column_id?: string;
  position?: number;
}

export type ResolutionHandling = "keep" | "detach" | "copy_to_target_board";

export interface MoveWithResolutionInput {
  column_id: string;
  position?: number;
  role_handling?: ResolutionHandling;
  prompt_handling?: ResolutionHandling;
}

export interface CreatePrimitiveInput {
  name: string;
  content?: string;
  color?: string;
  short_description?: string | null;
}

export type UpdatePrimitiveInput = Partial<CreatePrimitiveInput>;

export interface PromptGroup {
  id: string;
  name: string;
  color: string | null;
  position: number;
  created_at: number;
  updated_at: number;
  prompt_count: number;
  /** Sum of cl100k_base token counts across every member prompt — server
   *  computes it on the fly from the cached per-prompt counts. */
  token_count?: number;
  /** Member prompt ids in group-position order. Every list/get response
   *  includes this so the multi-select can compute "group fully covered"
   *  without a second round trip. */
  member_ids: string[];
}

export interface PromptInGroup {
  id: string;
  name: string;
  content: string;
  color: string | null;
  short_description?: string | null;
  token_count?: number;
  position: number;
}

export interface PromptGroupWithPrompts extends PromptGroup {
  prompts: PromptInGroup[];
}

export interface Tag {
  id: string;
  name: string;
  color: string | null;
  created_at: number;
  updated_at: number;
  prompt_count: number;
}

export interface PromptInTag {
  id: string;
  name: string;
  color: string | null;
}

export interface TagWithPrompts extends Tag {
  prompts: PromptInTag[];
}

/** One row per prompt with the prompt's full tag set, returned by
 *  `GET /api/prompts/with-tags` for the prompts sidebar chip render. */
export interface PromptWithTags {
  prompt_id: string;
  tags: Tag[];
}

export type PromptOrigin =
  | "direct"
  | "role"
  | "column"
  | "column-role"
  | "board"
  | "board-role";

export interface ResolvedPromptSource {
  type: "role" | "column" | "column-role" | "board" | "board-role";
  id: string;
  name: string;
}

export interface ResolvedPrompt {
  id: string;
  name: string;
  content: string;
  color: string | null;
  /** Cached token count for `content`. */
  token_count?: number;
  origin: PromptOrigin;
  source?: ResolvedPromptSource;
}

export type RoleSource = "task" | "column" | "board";

export interface ResolvedRole {
  id: string;
  name: string;
  content: string;
  color: string | null;
  source: RoleSource;
}

export interface ResolvedTaskContext {
  task_id: string;
  role: ResolvedRole | null;
  prompts: ResolvedPrompt[];
  /**
   * Prompt ids the user explicitly disabled for this task via per-task
   * overrides. Already filtered out of `prompts`; surfaced here so the UI
   * can grey out the corresponding inherited chip without a second request.
   * Optional for backwards compatibility — older servers may omit it.
   */
  disabled_prompts?: string[];
  /** Sum of token_count across every resolved prompt — drives the badge in
   *  the task dialog's bundle preview. */
  total_token_count: number;
}

export const REPORT_KINDS = [
  "investigation",
  "analysis",
  "plan",
  "summary",
  "review",
  "memo",
] as const;

export type ReportKind = (typeof REPORT_KINDS)[number];

export interface AgentReport {
  id: string;
  task_id: string;
  kind: ReportKind;
  title: string;
  content: string;
  /** Free-form provenance hint (e.g. "claude-desktop"); null for UI authors. */
  author: string | null;
  created_at: number;
  updated_at: number;
}

export interface ReportSearchHit {
  report: AgentReport;
  task: {
    id: string;
    title: string;
    board_id: string;
  };
}

export interface BackupInfo {
  filename: string;
  fullPath: string;
  size_bytes: number;
  created_at: number;
  reason: "manual" | "auto" | "pre-migration" | "pre-restore";
}

export interface ExportOptions {
  includeBoards?: boolean;
  includeRoles?: boolean;
  includePrompts?: boolean;
  includeSettings?: boolean;
  boardIds?: string[];
}

export interface ExportBundle {
  format_version: string;
  exported_at: string;
  app_version: string;
  options: ExportOptions;
  data: Record<string, unknown>;
}

export type ImportStrategy = "skip" | "rename";

export interface ImportPreviewCounts {
  total: number;
  new: number;
  conflicts: number;
}

export interface ImportPreview {
  format_ok: boolean;
  format_version?: string;
  counts: {
    boards: ImportPreviewCounts;
    roles: ImportPreviewCounts;
    prompts: ImportPreviewCounts;
    skills: ImportPreviewCounts;
    mcp_tools: ImportPreviewCounts;
    settings: { total: number };
  };
  conflicts: {
    boards: Array<{ id: string; name: string; resolution: "skip" | "rename" | "new" }>;
    roles: Array<{ id: string; name: string; resolution: "skip" | "rename" | "new" }>;
    prompts: Array<{ id: string; name: string; resolution: "skip" | "rename" | "new" }>;
    skills: Array<{ id: string; name: string; resolution: "skip" | "rename" | "new" }>;
    mcp_tools: Array<{ id: string; name: string; resolution: "skip" | "rename" | "new" }>;
  };
  errors: string[];
}

export interface ImportResult {
  counts: {
    boards: { added: number; skipped: number; renamed: number };
    columns: { added: number };
    tasks: { added: number };
    roles: { added: number; skipped: number; renamed: number };
    prompts: { added: number; skipped: number; renamed: number };
    skills: { added: number; skipped: number; renamed: number };
    mcp_tools: { added: number; skipped: number; renamed: number };
    settings: { upserted: number };
  };
}

export type ServerEvent =
  | { type: "space.created"; data: { spaceId: string; space: Space } }
  | { type: "space.updated"; data: { spaceId: string; space: Space } }
  | { type: "space.deleted"; data: { spaceId: string } }
  | { type: "spaces.reordered"; data: { ids: string[] } }
  | { type: "boards.reordered"; data: { spaceId: string; ids: string[] } }
  | {
      type: "board.moved_to_space";
      data: {
        boardId: string;
        spaceId: string;
        reslugged_count: number;
      };
    }
  | { type: "board.created"; data: { boardId: string; board: Board } }
  | { type: "board.updated"; data: { boardId: string; board: Board } }
  | { type: "board.deleted"; data: { boardId: string } }
  | {
      type: "board.role_changed";
      data: { boardId: string; roleId: string | null; board: Board };
    }
  | {
      type: "board.prompts_changed";
      data: { boardId: string; prompts: Prompt[] };
    }
  | { type: "column.created"; data: { boardId: string; column: Column } }
  | { type: "column.updated"; data: { boardId: string; columnId: string; column: Column } }
  | { type: "column.deleted"; data: { boardId: string; columnId: string } }
  | {
      type: "column.role_changed";
      data: {
        boardId: string;
        columnId: string;
        roleId: string | null;
        column: Column;
      };
    }
  | {
      type: "column.prompts_changed";
      data: { boardId: string; columnId: string; prompts: Prompt[] };
    }
  | {
      type: "column.reordered";
      data: { boardId: string; columnIds: string[] };
    }
  | { type: "task.created"; data: { boardId: string; task: Task } }
  | { type: "task.updated"; data: { boardId: string; taskId: string; task: Task } }
  | {
      type: "task.moved";
      data: {
        taskId: string;
        oldBoardId: string;
        newBoardId: string;
        oldColumnId: string;
        newColumnId: string;
        position: number;
      };
    }
  | { type: "task.deleted"; data: { boardId: string; taskId: string } }
  | {
      type: "task.role_changed";
      data: { boardId: string; taskId: string; roleId: string | null; task: Task };
    }
  | {
      type: "task.prompt_added";
      data: { boardId: string; taskId: string; promptId: string; task: Task };
    }
  | {
      type: "task.prompt_removed";
      data: { boardId: string; taskId: string; promptId: string; task: Task };
    }
  | {
      type: "task.skill_added";
      data: { boardId: string; taskId: string; skillId: string; task: Task };
    }
  | {
      type: "task.skill_removed";
      data: { boardId: string; taskId: string; skillId: string; task: Task };
    }
  | {
      type: "task.mcp_tool_added";
      data: { boardId: string; taskId: string; mcpToolId: string; task: Task };
    }
  | {
      type: "task.mcp_tool_removed";
      data: { boardId: string; taskId: string; mcpToolId: string; task: Task };
    }
  | { type: "prompt.created"; data: { prompt: Prompt } }
  | { type: "prompt.updated"; data: { promptId: string; prompt: Prompt } }
  | { type: "prompt.deleted"; data: { promptId: string } }
  | { type: "skill.created"; data: { skill: Skill } }
  | { type: "skill.updated"; data: { skillId: string; skill: Skill } }
  | { type: "skill.deleted"; data: { skillId: string } }
  | { type: "mcp_tool.created"; data: { mcpTool: McpTool } }
  | { type: "mcp_tool.updated"; data: { mcpToolId: string; mcpTool: McpTool } }
  | { type: "mcp_tool.deleted"; data: { mcpToolId: string } }
  | { type: "role.created"; data: { role: Role } }
  | { type: "role.updated"; data: { roleId: string; role: Role } }
  | { type: "role.deleted"; data: { roleId: string } }
  | {
      type: "role.relations_updated";
      data: { roleId: string; role: RoleWithRelations };
    }
  | { type: "setting.changed"; data: { key: string; value: unknown } }
  | { type: "setting.deleted"; data: { key: string } }
  | { type: "prompt_group.created"; data: { groupId: string; group: PromptGroup } }
  | { type: "prompt_group.updated"; data: { groupId: string; group: PromptGroup } }
  | { type: "prompt_group.deleted"; data: { groupId: string } }
  | { type: "prompt_group.reordered"; data: { ids: string[] } }
  | { type: "tag.created"; data: { tagId: string; tag: Tag } }
  | { type: "tag.updated"; data: { tagId: string; tag: Tag } }
  | { type: "tag.deleted"; data: { tagId: string } }
  | {
      type: "prompt.tags_changed";
      data: { promptId: string; tagIds: string[] };
    }
  | {
      type: "data.imported";
      data: {
        counts: {
          boards: { added: number; skipped: number; renamed: number };
          roles: { added: number; skipped: number; renamed: number };
          prompts: { added: number; skipped: number; renamed: number };
          skills: { added: number; skipped: number; renamed: number };
          mcp_tools: { added: number; skipped: number; renamed: number };
        };
      };
    }
  | { type: "data.restored"; data: { filename: string } }
  | { type: "data.backup_created"; data: { filename: string; reason: string } }
  | { type: "data.backup_deleted"; data: { filename: string } }
  | {
      type: "task.event_recorded";
      data: { boardId: string; taskId: string; event: TaskEvent };
    }
  | {
      type: "report.created";
      data: { taskId: string; reportId: string; report: AgentReport };
    }
  | {
      type: "report.updated";
      data: { taskId: string; reportId: string; report: AgentReport };
    }
  | { type: "report.deleted"; data: { taskId: string; reportId: string } };

/** Closed enum of activity-log event types — keep in sync with server. */
export type TaskEventType =
  | "task.created"
  | "task.updated"
  | "task.moved"
  | "task.deleted"
  | "task.role_changed"
  | "task.prompt_added"
  | "task.prompt_removed"
  | "task.skill_added"
  | "task.skill_removed"
  | "task.mcp_tool_added"
  | "task.mcp_tool_removed";

export interface TaskEvent {
  id: string;
  task_id: string;
  type: TaskEventType;
  /** `null` when triggered by direct UI requests; otherwise the bridge's
   *  agent_hint (e.g. `claude-desktop`, `cursor`). */
  actor: string | null;
  /** Type-specific JSON payload — see backend recordTaskEvent call sites. */
  details: Record<string, unknown> | null;
  created_at: number;
}
