import type { ErrorHandler } from "hono";
import { HTTPException } from "hono/http-exception";
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

  // Hono's own HTTPException carries the intended status code (e.g. 400 for
  // malformed JSON in a zValidator body). Propagate it verbatim instead of
  // masking it as 500.
  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status);
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
