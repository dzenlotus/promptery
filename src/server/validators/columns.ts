import { z } from "zod";

export const createColumnSchema = z.object({
  name: z.string().min(1).max(50),
});

export const updateColumnSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  position: z.number().int().min(0).optional(),
});

export const setColumnRoleSchema = z.object({
  role_id: z.string().min(1).nullable(),
});

export const setColumnPromptsSchema = z.object({
  prompt_ids: z.array(z.string().min(1)),
});
