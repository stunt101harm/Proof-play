import { TxlineDiagnosticError, txlineHttpError } from "./errors";
import type { TxlineNetworkConfig } from "./network";
import { emitTxlineTelemetry, type TxlineTelemetrySink } from "./telemetry";

export type TxlineCredentials = {
  apiToken: string;
  guestJwt: string;
};

export type TxlineClientOptions = {
  fetch?: typeof fetch;
  renewGuestJwt?: () => Promise<string>;
  telemetry?: TxlineTelemetrySink;
};

export async function startGuestSession(
  config: TxlineNetworkConfig,
  fetchImplementation: typeof fetch = fetch,
) {
  const endpoint = "/auth/guest/start";
  const response = await fetchImplementation(
    new URL(endpoint, config.apiOrigin),
    {
      method: "POST",
      headers: { Accept: "application/json" },
    },
  );
  if (!response.ok) {
    throw txlineHttpError(endpoint, response.status, await response.text());
  }
  const body = (await response.json()) as unknown;
  const token =
    typeof body === "object" && body !== null && "token" in body
      ? (body as { token?: unknown }).token
      : undefined;
  if (typeof token !== "string" || token.length === 0) {
    throw new TxlineDiagnosticError({
      code: "TXLINE_INVALID_RESPONSE",
      message: "TxLINE guest authentication did not return a token.",
      hint: "Confirm the guest-auth host matches the configured TxLINE network.",
      endpoint,
      status: response.status,
    });
  }
  return token;
}

export function parseSseJsonData(value: string) {
  const records: unknown[] = [];

  for (const event of value.split(/\r?\n\r?\n/)) {
    const data = event
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n");
    if (!data || data === "[DONE]") continue;

    try {
      records.push(JSON.parse(data) as unknown);
    } catch {
      // Ignore connection-level or heartbeat events that are not JSON records.
    }
  }

  return records;
}

export class TxlineApiClient {
  readonly config: TxlineNetworkConfig;
  readonly credentials: TxlineCredentials;
  readonly #fetch: typeof fetch;
  readonly #renewGuestJwt?: () => Promise<string>;
  readonly #telemetry?: TxlineTelemetrySink;

  constructor(
    config: TxlineNetworkConfig,
    credentials: TxlineCredentials,
    options: TxlineClientOptions = {},
  ) {
    this.config = config;
    this.credentials = { ...credentials };
    this.#fetch = options.fetch ?? fetch;
    this.#renewGuestJwt = options.renewGuestJwt;
    this.#telemetry = options.telemetry;
  }

  async getJson<T>(endpoint: string): Promise<T> {
    const response = await this.#request(endpoint, {
      accept: "application/json",
      renewed: false,
    });
    const responseBody = await response.text();
    if (response.headers.get("content-type")?.includes("text/event-stream")) {
      return parseSseJsonData(responseBody) as T;
    }
    if (!responseBody) return undefined as T;

    try {
      return JSON.parse(responseBody) as T;
    } catch (cause) {
      throw new TxlineDiagnosticError({
        code: "TXLINE_INVALID_RESPONSE",
        message: `TxLINE returned non-JSON data for ${endpoint}.`,
        hint: "Confirm the endpoint path and inspect a redacted response body.",
        endpoint,
        status: response.status,
        cause,
      });
    }
  }

  async openEventStream(
    endpoint: string,
    options: { signal?: AbortSignal; lastEventId?: string } = {},
  ) {
    return this.#request(endpoint, {
      accept: "text/event-stream",
      renewed: false,
      signal: options.signal,
      lastEventId: options.lastEventId,
    });
  }

  async #request(
    endpoint: string,
    options: {
      accept: "application/json" | "text/event-stream";
      renewed: boolean;
      signal?: AbortSignal;
      lastEventId?: string;
    },
  ): Promise<Response> {
    const relativeEndpoint = endpoint.startsWith("/")
      ? endpoint.slice(1)
      : endpoint;
    const startedAt = Date.now();
    let response: Response;

    try {
      response = await this.#fetch(
        new URL(relativeEndpoint, `${this.config.apiBaseUrl}/`),
        {
          headers: {
            Accept: options.accept,
            Authorization: `Bearer ${this.credentials.guestJwt}`,
            "Cache-Control": "no-cache",
            "X-Api-Token": this.credentials.apiToken,
            ...(options.lastEventId
              ? { "Last-Event-ID": options.lastEventId }
              : {}),
          },
          signal: options.signal,
        },
      );
    } catch (cause) {
      emitTxlineTelemetry(this.#telemetry, {
        kind: "request",
        operation: "http",
        outcome: "error",
        endpoint,
        durationMs: Date.now() - startedAt,
        code: cause instanceof Error ? cause.name : "FETCH_ERROR",
      });
      throw cause;
    }

    if (response.status === 401 && !options.renewed && this.#renewGuestJwt) {
      emitTxlineTelemetry(this.#telemetry, {
        kind: "request",
        operation: "guest-jwt-renewal",
        outcome: "retry",
        endpoint,
        status: response.status,
        durationMs: Date.now() - startedAt,
      });
      await response.body?.cancel();
      this.credentials.guestJwt = await this.#renewGuestJwt();
      return this.#request(endpoint, { ...options, renewed: true });
    }

    if (!response.ok) {
      emitTxlineTelemetry(this.#telemetry, {
        kind: "request",
        operation: "http",
        outcome: "error",
        endpoint,
        status: response.status,
        durationMs: Date.now() - startedAt,
      });
      throw txlineHttpError(endpoint, response.status, await response.text());
    }

    emitTxlineTelemetry(this.#telemetry, {
      kind: "request",
      operation:
        options.accept === "text/event-stream" ? "sse-connect" : "http",
      outcome: "success",
      endpoint,
      status: response.status,
      durationMs: Date.now() - startedAt,
    });
    return response;
  }
}
