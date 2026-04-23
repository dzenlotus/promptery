export class ConflictError extends Error {
  /** Optional field that clashed — used by the HTTP layer to surface the
   *  conflict inline next to the offending form control. */
  readonly field?: string;

  constructor(message: string, opts?: { field?: string }) {
    super(message);
    this.name = "ConflictError";
    this.field = opts?.field;
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
