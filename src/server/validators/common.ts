import { z } from "zod";

/**
 * Shared rules for prompt / role / skill / mcp-tool names.
 *
 * Keep in sync with `ui/src/lib/validation.ts` — the client runs the same
 * checks inline so the user sees the error before we round-trip to the server.
 */
export const NAME_ALLOWED_CHARS = /^[a-zA-Z0-9 _-]+$/;
export const NAME_CONTAINS_LETTER = /[a-zA-Z]/;
export const NAME_MAX_LENGTH = 50;

export const primitiveName = z
  .string({ error: "Name is required" })
  .min(1, "Name is required")
  .max(NAME_MAX_LENGTH, `Name must be at most ${NAME_MAX_LENGTH} characters`)
  .refine((v) => v.trim().length > 0, "Name cannot be blank")
  .refine(
    (v) => NAME_ALLOWED_CHARS.test(v),
    "Use English letters, digits, spaces, '-' or '_' only"
  )
  .refine(
    (v) => NAME_CONTAINS_LETTER.test(v),
    "Name must include at least one letter"
  );

export const hexColor = z
  .string()
  .regex(
    /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/,
    "Color must be a hex code like #RGB or #RRGGBB"
  );

export const primitiveContent = z
  .string()
  .max(20000, "Content must be at most 20000 characters");
