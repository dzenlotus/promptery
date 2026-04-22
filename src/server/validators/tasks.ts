import { z } from "zod";

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
  position: z.number().finite(),
});

export const addTagSchema = z.object({
  tag_id: z.string().min(1),
});
