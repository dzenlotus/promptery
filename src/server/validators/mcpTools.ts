import { z } from "zod";
import { primitiveName, hexColor, primitiveContent } from "./common.js";

export const createMcpToolSchema = z.object({
  name: primitiveName,
  content: primitiveContent.optional(),
  color: hexColor.optional(),
});

export const updateMcpToolSchema = createMcpToolSchema.partial();
