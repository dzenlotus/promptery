import { z } from "zod";

/**
 * Mirror of `src/db/queries/spaces.ts:isValidPrefix`. The DB layer also
 * validates and throws `ValidationError`; surfacing the rule here lets
 * the HTTP layer return a clean 400 with field info before any DB call.
 */
const prefixSchema = z
  .string()
  .min(1)
  .max(10)
  .regex(/^[a-z0-9-]+$/, "must be lowercase letters, digits, or hyphens");

export const createSpaceSchema = z.object({
  name: z.string().min(1).max(200),
  prefix: prefixSchema,
  description: z.string().max(2000).optional(),
});

export const updateSpaceSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  prefix: prefixSchema.optional(),
  description: z.string().max(2000).nullable().optional(),
});

export const moveBoardToSpaceSchema = z.object({
  space_id: z.string().min(1),
  /** Optional explicit position. Used by drag-and-drop to drop the board
   *  between two existing rows; omit to append to end. */
  position: z.number().finite().optional(),
});

export const reorderSpacesSchema = z.object({
  ids: z.array(z.string().min(1)).min(1),
});
