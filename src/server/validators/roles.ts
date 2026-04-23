import { z } from "zod";
import { primitiveName, hexColor, primitiveContent } from "./common.js";

export const createRoleSchema = z.object({
  name: primitiveName,
  content: primitiveContent.optional(),
  color: hexColor.optional(),
});

export const updateRoleSchema = createRoleSchema.partial();

export const setRolePromptsSchema = z.object({
  prompt_ids: z.array(z.string().min(1)),
});

export const setRoleSkillsSchema = z.object({
  skill_ids: z.array(z.string().min(1)),
});

export const setRoleMcpToolsSchema = z.object({
  mcp_tool_ids: z.array(z.string().min(1)),
});
