import { z } from "zod";

export const createBoardSchema = z.object({
  name: z.string().min(1).max(100),
  space_id: z.string().min(1).optional(),
});

export const updateBoardSchema = z.object({
  name: z.string().min(1).max(100).optional(),
});

export const setBoardRoleSchema = z.object({
  role_id: z.string().min(1).nullable(),
});

export const setBoardPromptsSchema = z.object({
  prompt_ids: z.array(z.string().min(1)),
});

export const moveBoardToSpaceSchema = z.object({
  space_id: z.string().min(1),
  /** Optional explicit position in the destination space. */
  position: z.number().finite().optional(),
});

export const reorderBoardsSchema = z.object({
  /** The space whose boards are being reordered. Boards from other spaces
   *  in the `ids` list are silently ignored at the repo layer. */
  space_id: z.string().min(1),
  ids: z.array(z.string().min(1)).min(1),
});
