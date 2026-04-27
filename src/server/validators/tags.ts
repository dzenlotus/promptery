import { z } from "zod";
import { hexColor } from "./common.js";

/**
 * Tag name rules are looser than primitive (prompt/role/skill/mcp_tool)
 * names — tags are short labels users may want to write with punctuation
 * (e.g. "v1.0", "WIP/draft"). Just trim + length cap; uniqueness is
 * enforced at the DB level (case-insensitive in queries).
 */
const tagName = z
  .string({ error: "Name is required" })
  .min(1, "Name is required")
  .max(50, "Name must be at most 50 characters")
  .refine((v) => v.trim().length > 0, "Name cannot be blank");

export const createTagSchema = z.object({
  name: tagName,
  color: hexColor.nullable().optional(),
  prompt_ids: z.array(z.string().min(1)).optional(),
});

export const updateTagSchema = z.object({
  name: tagName.optional(),
  color: hexColor.nullable().optional(),
});

export const setTagPromptsSchema = z.object({
  prompt_ids: z.array(z.string().min(1)),
});

export const addTagPromptSchema = z.object({
  prompt_id: z.string().min(1),
});
