export type TxlineTelemetryEvent = {
  timestamp: string;
  kind: "request" | "stream" | "normalization";
  operation: string;
  outcome: "success" | "error" | "retry" | "duplicate";
  durationMs?: number;
  endpoint?: string;
  status?: number;
  attempt?: number;
  recordCount?: number;
  code?: string;
};

export type TxlineTelemetrySink = (event: TxlineTelemetryEvent) => void;

export function emitTxlineTelemetry(
  sink: TxlineTelemetrySink | undefined,
  event: Omit<TxlineTelemetryEvent, "timestamp">,
) {
  if (!sink) return;

  try {
    sink({ timestamp: new Date().toISOString(), ...event });
  } catch {
    // Observability must never break a data or settlement path.
  }
}
