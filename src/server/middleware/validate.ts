import { zValidator } from "@hono/zod-validator";
import type { ZodSchema } from "zod";

/**
 * Wrapper around `zValidator("json", ...)` that normalises failure responses
 * into a single shape the UI can render inline:
 *
 *   {
 *     error:  string,   // first issue's message — human readable
 *     field:  string,   // dotted path of the first issue (e.g. "name")
 *     issues: Array<{ field, message }>  // all issues, in order
 *   }
 */
export function validateJson<T extends ZodSchema>(schema: T) {
  return zValidator("json", schema, (result, c) => {
    if (!result.success) {
      const issues = result.error.issues.map((i) => ({
        field: i.path.join("."),
        message: i.message,
      }));
      const first = issues[0];
      return c.json(
        {
          error: first?.message ?? "Invalid input",
          field: first?.field ?? undefined,
          issues,
        },
        400
      );
    }
  });
}
