import { z } from "zod";
import { primitiveName, hexColor, primitiveContent } from "./common.js";

const shortDescription = z
  .string()
  .max(200, "Short description must be at most 200 characters")
  .nullable()
  .optional();

export const createPromptSchema = z.object({
  name: primitiveName,
  content: primitiveContent.optional(),
  color: hexColor.optional(),
  short_description: shortDescription,
});

export const updatePromptSchema = createPromptSchema.partial();
