import { z } from "zod";

export const createColumnSchema = z.object({
  name: z.string().min(1).max(50),
});

export const updateColumnSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  position: z.number().int().min(0).optional(),
});
