import { TxlineDiagnosticError, redactTxlineSecrets } from "@proof-play/txline";

export function readIntegerQuery(
  searchParams: URLSearchParams,
  name: string,
  options: { min?: number; max?: number } = {},
) {
  const raw = searchParams.get(name);
  if (raw === null) return undefined;
  const value = Number(raw);
  if (
    !Number.isSafeInteger(value) ||
    value < (options.min ?? 0) ||
    value > (options.max ?? Number.MAX_SAFE_INTEGER)
  ) {
    throw new TxlineDiagnosticError({
      code: "TXLINE_INVALID_INPUT",
      message: `${name} must be an integer in the supported range.`,
      hint: "Use query values documented by the normalized ProofPlay API.",
      status: 400,
    });
  }
  return value;
}

export function txlineJson(data: unknown, status = 200) {
  return Response.json(
    {
      data,
      meta: {
        source: "txline",
        network: "devnet",
        generatedAt: new Date().toISOString(),
      },
    },
    {
      status,
      headers: { "Cache-Control": "private, no-store" },
    },
  );
}

export function publicTxlineError(error: unknown) {
  if (error instanceof TxlineDiagnosticError) {
    return {
      code: error.code,
      message: redactTxlineSecrets(error.message),
      hint: error.hint,
    };
  }
  return {
    code: "TXLINE_HTTP_ERROR",
    message: "The TxLINE data request could not be completed.",
    hint: "Retry shortly or inspect the server-side redacted telemetry.",
  };
}

export function txlineErrorResponse(error: unknown) {
  const publicError = publicTxlineError(error);
  const status =
    error instanceof TxlineDiagnosticError
      ? (error.status ??
        (error.code === "TXLINE_INVALID_INPUT" ||
        error.code === "TXLINE_INVALID_SEQUENCE"
          ? 400
          : error.code === "TXLINE_NOT_FOUND"
            ? 404
            : 502))
      : 502;
  return Response.json(
    { error: publicError },
    { status, headers: { "Cache-Control": "private, no-store" } },
  );
}
