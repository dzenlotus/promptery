import { z } from "zod";

export const exportSchema = z.object({
  includeBoards: z.boolean().optional(),
  includeRoles: z.boolean().optional(),
  includePrompts: z.boolean().optional(),
  includeSettings: z.boolean().optional(),
  boardIds: z.array(z.string()).optional(),
});

export const importPreviewSchema = z.object({
  bundle: z.unknown(),
  strategy: z.enum(["skip", "rename"]).optional(),
});

export const importApplySchema = z.object({
  bundle: z.unknown(),
  strategy: z.enum(["skip", "rename"]),
});

export const createBackupSchema = z.object({
  name: z.string().min(1).max(80).optional(),
});
