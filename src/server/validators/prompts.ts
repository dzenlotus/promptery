import { z } from "zod";
import { primitiveName, hexColor, primitiveContent } from "./common.js";

export const createPromptSchema = z.object({
  name: primitiveName,
  content: primitiveContent.optional(),
  color: hexColor.optional(),
});

export const updatePromptSchema = createPromptSchema.partial();
