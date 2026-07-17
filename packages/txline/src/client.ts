import { TxlineDiagnosticError, txlineHttpError } from "./errors";
import type { TxlineNetworkConfig } from "./network";

export type TxlineCredentials = {
  apiToken: string;
  guestJwt: string;
};

export type TxlineClientOptions = {
  fetch?: typeof fetch;
  renewGuestJwt?: () => Promise<string>;
};

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

  constructor(
    config: TxlineNetworkConfig,
    credentials: TxlineCredentials,
    options: TxlineClientOptions = {},
  ) {
    this.config = config;
    this.credentials = { ...credentials };
    this.#fetch = options.fetch ?? fetch;
    this.#renewGuestJwt = options.renewGuestJwt;
  }

  async getJson<T>(endpoint: string): Promise<T> {
    return this.#requestJson<T>(endpoint, false);
  }

  async #requestJson<T>(endpoint: string, renewed: boolean): Promise<T> {
    const relativeEndpoint = endpoint.startsWith("/")
      ? endpoint.slice(1)
      : endpoint;
    const response = await this.#fetch(
      new URL(relativeEndpoint, `${this.config.apiBaseUrl}/`),
      {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${this.credentials.guestJwt}`,
          "X-Api-Token": this.credentials.apiToken,
        },
      },
    );

    if (response.status === 401 && !renewed && this.#renewGuestJwt) {
      this.credentials.guestJwt = await this.#renewGuestJwt();
      return this.#requestJson<T>(endpoint, true);
    }

    if (!response.ok) {
      throw txlineHttpError(endpoint, response.status, await response.text());
    }

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
}
