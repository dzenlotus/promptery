import { z } from "zod";

const tagName = z
  .string()
  .min(1)
  .max(50)
  .regex(/^[a-z0-9_-]+$/, "only lowercase letters, digits, '-' and '_' are allowed");

const hexColor = z.string().regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "expected #RGB or #RRGGBB");

export const tagKindSchema = z.enum(["role", "skill", "prompt", "mcp"]);

export const createTagSchema = z.object({
  name: tagName,
  kind: tagKindSchema,
  description: z.string().optional(),
  color: hexColor.optional(),
});

export const updateTagSchema = z.object({
  name: tagName.optional(),
  description: z.string().optional(),
  color: hexColor.optional(),
  kind: tagKindSchema.optional(),
});
