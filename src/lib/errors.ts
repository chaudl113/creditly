/** Expected, user-facing failures. Anything else is a bug and surfaces as 500. */
export class AppError extends Error {
  constructor(
    public readonly code:
      | "EMAIL_TAKEN"
      | "INVALID_TOKEN"
      | "INSUFFICIENT_CREDITS"
      | "RATE_LIMITED"
      | "FORBIDDEN"
      | "NOT_FOUND"
      | "VALIDATION",
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}
