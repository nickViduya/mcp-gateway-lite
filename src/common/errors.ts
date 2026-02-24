export class GatewayError extends Error {
  public readonly statusCode: number;
  public readonly code: string;

  public constructor(code: string, message: string, statusCode = 500) {
    super(message);
    this.name = "GatewayError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export class AuthenticationRequiredError extends GatewayError {
  public constructor(message = "Authentication is required for this operation") {
    super("authentication_required", message, 401);
    this.name = "AuthenticationRequiredError";
  }
}

export class RunnerRequiredError extends GatewayError {
  public constructor(message: string) {
    super("runner_required", message, 400);
    this.name = "RunnerRequiredError";
  }
}

export class ValidationError extends GatewayError {
  public constructor(message: string) {
    super("validation_error", message, 400);
    this.name = "ValidationError";
  }
}
