import { EventSource } from "eventsource";
import { TxlineDiagnosticError } from "./errors";
import type { TxlineCredentials } from "./client";
import type { TxlineNetworkConfig } from "./network";

export async function connectScoresStream(options: {
  config: TxlineNetworkConfig;
  credentials: TxlineCredentials;
  timeoutMs?: number;
}) {
  const timeoutMs = options.timeoutMs ?? 15_000;
  const streamUrl = `${options.config.apiBaseUrl}/scores/stream`;

  return new Promise<{ connectedAt: string; streamUrl: string }>(
    (resolve, reject) => {
      let opened = false;
      const eventSource = new EventSource(streamUrl, {
        fetch: async (input, init) => {
          const headers = new Headers(init?.headers);
          headers.set("Accept", "text/event-stream");
          headers.set(
            "Authorization",
            `Bearer ${options.credentials.guestJwt}`,
          );
          headers.set("X-Api-Token", options.credentials.apiToken);
          return fetch(input, { ...init, headers });
        },
      });
      const timer = setTimeout(() => {
        eventSource.close();
        reject(
          new TxlineDiagnosticError({
            code: "TXLINE_SSE_ERROR",
            message: `TxLINE scores SSE did not open within ${timeoutMs}ms.`,
            hint: "Confirm both auth headers and the devnet host. No data messages is normal when no covered fixture is active, but the connection must open.",
            endpoint: "/scores/stream",
          }),
        );
      }, timeoutMs);

      eventSource.onopen = () => {
        opened = true;
        clearTimeout(timer);
        eventSource.close();
        resolve({ connectedAt: new Date().toISOString(), streamUrl });
      };
      eventSource.onerror = (cause) => {
        if (opened) return;
        clearTimeout(timer);
        eventSource.close();
        reject(
          new TxlineDiagnosticError({
            code: "TXLINE_SSE_ERROR",
            message: "TxLINE scores SSE connection was rejected.",
            hint: "Renew the guest JWT, verify the API token, and confirm the stream uses the devnet API host.",
            endpoint: "/scores/stream",
            cause,
          }),
        );
      };
    },
  );
}
