import type { ErrorHandler } from "hono";
import { ConflictError } from "../../db/queries/errors.js";

export const errorHandler: ErrorHandler = (err, c) => {
  if (err instanceof ConflictError) {
    return c.json({ error: err.message }, 409);
  }

  console.error("[promptery] error:", err);

  const isDev = process.env.NODE_ENV !== "production";
  const body: Record<string, unknown> = { error: "Internal server error" };
  if (isDev) {
    body.message = err.message;
    body.stack = err.stack;
  }
  return c.json(body, 500);
};
