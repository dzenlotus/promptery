import { z } from "zod";
import { primitiveName, hexColor, primitiveContent } from "./common.js";

export const createSkillSchema = z.object({
  name: primitiveName,
  content: primitiveContent.optional(),
  color: hexColor.optional(),
});

export const updateSkillSchema = createSkillSchema.partial();
