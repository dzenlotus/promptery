import { z } from "zod";
import { REPORT_KINDS } from "../../db/queries/agentReports.js";

const kindSchema = z.enum(REPORT_KINDS);

// Title cap is generous but bounded — long enough for descriptive headlines
// ("Investigation: cmdk crash on first keystroke") without becoming an
// attack vector for unbounded payloads. Content is treated as markdown so
// it can hold a full memo; we still cap to keep one report from filling
// the page (and to bound the FTS index) — same ceiling as primitive content.
export const REPORT_TITLE_MAX = 200;
export const REPORT_CONTENT_MAX = 100_000;
export const REPORT_AUTHOR_MAX = 100;

const titleSchema = z
  .string({ error: "Title is required" })
  .min(1, "Title is required")
  .max(REPORT_TITLE_MAX, `Title must be at most ${REPORT_TITLE_MAX} characters`)
  .refine((v) => v.trim().length > 0, "Title cannot be blank");

const contentSchema = z
  .string({ error: "Content is required" })
  .min(1, "Content is required")
  .max(REPORT_CONTENT_MAX, `Content must be at most ${REPORT_CONTENT_MAX} characters`);

const authorSchema = z
  .string()
  .max(REPORT_AUTHOR_MAX, `Author must be at most ${REPORT_AUTHOR_MAX} characters`)
  .nullable()
  .optional();

export const createAgentReportSchema = z.object({
  kind: kindSchema,
  title: titleSchema,
  content: contentSchema,
  author: authorSchema,
});

export const updateAgentReportSchema = z
  .object({
    kind: kindSchema.optional(),
    title: titleSchema.optional(),
    content: contentSchema.optional(),
  })
  .refine(
    (v) => v.kind !== undefined || v.title !== undefined || v.content !== undefined,
    "At least one field must be provided"
  );

export const searchReportsQuerySchema = z.object({
  q: z.string().min(1, "Query is required"),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});
