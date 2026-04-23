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
