export class ConflictError extends Error {
  /** Optional field that clashed — used by the HTTP layer to surface the
   *  conflict inline next to the offending form control. */
  readonly field?: string;
  /** Machine-readable error code (e.g. "PrefixCollision"). Defaults to the
   *  generic name "Conflict" when the call site doesn't pass one. */
  readonly code: string;

  constructor(
    message: string,
    opts?: { field?: string; code?: string }
  );
  constructor(code: string, message: string);
  constructor(
    a: string,
    b?: { field?: string; code?: string } | string
  ) {
    if (typeof b === "string") {
      // (code, message) form — used by spaces.ts for prefix collisions.
      super(b);
      this.code = a;
    } else {
      super(a);
      this.code = b?.code ?? "Conflict";
      this.field = b?.field;
    }
    this.name = "ConflictError";
  }
}

/**
 * Thrown when a delete is refused because child rows exist. Carries the
 * count so the UI and the MCP tool can phrase a precise error for the user
 * or the agent instead of a generic 409.
 */
export class ColumnNotEmptyError extends Error {
  readonly taskCount: number;

  constructor(message: string, taskCount: number) {
    super(message);
    this.name = "ColumnNotEmptyError";
    this.taskCount = taskCount;
  }
}

/**
 * Thrown when input fails a domain rule (e.g. invalid space prefix). The
 * HTTP layer maps this to 400 with the carried `code` so the UI can show
 * a field-specific message.
 */
export class ValidationError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "ValidationError";
  }
}

/**
 * Thrown when a referenced entity does not exist. The HTTP layer maps this
 * to 404. `kind` identifies the entity type ("space", "board", …), useful
 * for both error rendering and MCP tool guidance.
 */
export class NotFoundError extends Error {
  readonly kind: string;
  readonly id: string;

  constructor(kind: string, id: string) {
    super(`${kind} not found: ${id}`);
    this.kind = kind;
    this.id = id;
    this.name = "NotFoundError";
  }
}

/**
 * Thrown when an operation violates a domain invariant — for example,
 * deleting the default space or deleting a space that still has boards.
 * Maps to 409 with `code` carried through to the response.
 */
export class ConstraintError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "ConstraintError";
  }
}
