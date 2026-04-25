import type { ErrorHandler } from "hono";
import {
  ConflictError,
  ConstraintError,
  NotFoundError,
  ValidationError,
} from "../../db/queries/errors.js";

export const errorHandler: ErrorHandler = (err, c) => {
  if (err instanceof ConflictError) {
    return c.json(
      {
        error: err.code,
        message: err.message,
        field: err.field,
        issues: err.field
          ? [{ field: err.field, message: err.message }]
          : undefined,
      },
      409
    );
  }

  if (err instanceof ConstraintError) {
    return c.json({ error: err.code, message: err.message }, 409);
  }

  if (err instanceof ValidationError) {
    return c.json({ error: err.code, message: err.message }, 400);
  }

  if (err instanceof NotFoundError) {
    return c.json({ error: "NotFound", message: err.message, kind: err.kind, id: err.id }, 404);
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
