import { AuthenticationRequiredError, GatewayError } from "../common/errors.js";

export class UpstreamInvocationError extends GatewayError {
  public constructor(message: string) {
    super("upstream_invocation_failed", message, 502);
    this.name = "UpstreamInvocationError";
  }
}

export class UpstreamAuthRequiredError extends AuthenticationRequiredError {
  public constructor(message = "Upstream service authentication required") {
    super(message);
    this.name = "UpstreamAuthRequiredError";
  }
}
