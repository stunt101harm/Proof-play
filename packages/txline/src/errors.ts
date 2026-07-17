export type TxlineErrorCode =
  | "TXLINE_ACCESS_DENIED"
  | "TXLINE_HTTP_ERROR"
  | "TXLINE_INVALID_INPUT"
  | "TXLINE_INVALID_RESPONSE"
  | "TXLINE_INVALID_SEQUENCE"
  | "TXLINE_JWT_EXPIRED"
  | "TXLINE_NETWORK_MISMATCH"
  | "TXLINE_NOT_FOUND"
  | "TXLINE_NORMALIZATION_ERROR"
  | "TXLINE_SSE_ERROR";

export class TxlineDiagnosticError extends Error {
  readonly code: TxlineErrorCode;
  readonly endpoint?: string;
  readonly hint: string;
  readonly status?: number;

  constructor(options: {
    code: TxlineErrorCode;
    message: string;
    hint: string;
    endpoint?: string;
    status?: number;
    cause?: unknown;
  }) {
    super(options.message, { cause: options.cause });
    this.name = "TxlineDiagnosticError";
    this.code = options.code;
    this.endpoint = options.endpoint;
    this.hint = options.hint;
    this.status = options.status;
  }
}

export function redactTxlineSecrets(value: string) {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, "Bearer [redacted]")
    .replace(
      /("?(?:apiToken|guestJwt|token|walletSignature)"?\s*[:=]\s*")([^"]+)(")/gi,
      "$1[redacted]$3",
    )
    .slice(0, 1_000);
}

export function txlineHttpError(
  endpoint: string,
  status: number,
  responseBody: string,
) {
  const body = redactTxlineSecrets(responseBody);

  if (status === 401) {
    return new TxlineDiagnosticError({
      code: "TXLINE_JWT_EXPIRED",
      message: `TxLINE rejected ${endpoint} with 401 Unauthorized.`,
      hint: "Renew the guest JWT from the same devnet host and retry with the existing API token.",
      endpoint,
      status,
    });
  }

  if (status === 403) {
    return new TxlineDiagnosticError({
      code: "TXLINE_ACCESS_DENIED",
      message: `TxLINE rejected ${endpoint} with 403 Access denied.`,
      hint: "Check that the API token, guest JWT, subscription transaction, signing wallet, and API host all belong to devnet.",
      endpoint,
      status,
    });
  }

  if (
    endpoint.includes("stat-validation") &&
    [400, 404, 422].includes(status)
  ) {
    return new TxlineDiagnosticError({
      code: "TXLINE_INVALID_SEQUENCE",
      message: `TxLINE could not build a proof for the requested score sequence (${status}).`,
      hint: "Use a non-zero Seq/seq observed in a snapshot, historical response, update, or scores stream; never invent a sequence.",
      endpoint,
      status,
    });
  }

  return new TxlineDiagnosticError({
    code: "TXLINE_HTTP_ERROR",
    message: `TxLINE request ${endpoint} failed with ${status}${body ? `: ${body}` : "."}`,
    hint: "Confirm the endpoint path and devnet credentials, then retry with redacted logs.",
    endpoint,
    status,
  });
}
