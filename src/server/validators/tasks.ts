import { z } from "zod";

export const searchTasksQuerySchema = z.object({
  query: z.string().optional(),
  board_id: z.string().min(1).optional(),
  column_id: z.string().min(1).optional(),
  role_id: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

export const createTaskSchema = z.object({
  column_id: z.string().min(1),
  title: z.string().min(1).max(200),
  description: z.string().optional(),
});

export const updateTaskSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().optional(),
  column_id: z.string().min(1).optional(),
  position: z.number().finite().optional(),
});

export const moveTaskSchema = z.object({
  column_id: z.string().min(1),
  position: z.number().finite().optional(),
});

export const setTaskRoleSchema = z.object({
  role_id: z.string().min(1).nullable(),
});

export const addTaskPromptSchema = z.object({
  prompt_id: z.string().min(1),
});

export const addTaskSkillSchema = z.object({
  skill_id: z.string().min(1),
});

export const addTaskMcpToolSchema = z.object({
  mcp_tool_id: z.string().min(1),
});

const resolutionHandlingSchema = z.enum(["keep", "detach", "copy_to_target_board"]);

export const moveTaskWithResolutionSchema = z.object({
  column_id: z.string().min(1),
  position: z.number().finite().optional(),
  role_handling: resolutionHandlingSchema.default("keep"),
  prompt_handling: resolutionHandlingSchema.default("keep"),
});

/**
 * Per-task prompt override toggle. enabled=0 suppresses the inherited prompt
 * for this task; enabled=1 is reserved for future force-enable semantics. We
 * accept both values today so the UI can flip back and forth without round-
 * tripping through DELETE in scenarios where that helps.
 */
export const setTaskPromptOverrideSchema = z.object({
  enabled: z.union([z.literal(0), z.literal(1)]),
});
