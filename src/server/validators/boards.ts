import { z } from "zod";

export const createBoardSchema = z.object({
  name: z.string().min(1).max(100),
});

export const updateBoardSchema = z.object({
  name: z.string().min(1).max(100).optional(),
});

export const setBoardRoleSchema = z.object({
  role_id: z.string().min(1).nullable(),
});

export const setBoardPromptsSchema = z.object({
  prompt_ids: z.array(z.string().min(1)),
});
