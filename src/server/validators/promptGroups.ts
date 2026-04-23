import { z } from "zod";
import { hexColor } from "./common.js";

export const createPromptGroupSchema = z.object({
  name: z.string().min(1).max(100),
  // color accepts hex ("#rrggbb") or explicit null — UI renders a neutral
  // folder icon when null so "no color" stays a first-class state.
  color: hexColor.nullable().optional(),
  prompt_ids: z.array(z.string().min(1)).optional(),
});

export const updatePromptGroupSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  color: hexColor.nullable().optional(),
  position: z.number().int().min(0).optional(),
});

export const setGroupPromptsSchema = z.object({
  prompt_ids: z.array(z.string().min(1)),
});

export const addGroupPromptSchema = z.object({
  prompt_id: z.string().min(1),
});

export const reorderPromptGroupsSchema = z.object({
  ids: z.array(z.string().min(1)),
});
