import type { MatchScoreRecord } from "@proof-play/domain";
import { TxlineApiClient, type TxlineCredentials } from "./client";
import { TxlineDiagnosticError } from "./errors";
import type { TxlineNetworkConfig } from "./network";
import { normalizeScore } from "./normalizers";
import { emitTxlineTelemetry, type TxlineTelemetrySink } from "./telemetry";

export type SseMessage = {
  id?: string;
  event?: string;
  data: string;
  retry?: number;
};

export function parseSseBlock(block: string): SseMessage | null {
  const message: SseMessage = { data: "" };

  for (const rawLine of block.split(/\r?\n/)) {
    if (!rawLine || rawLine.startsWith(":")) continue;
    const separatorIndex = rawLine.indexOf(":");
    const field =
      separatorIndex === -1 ? rawLine : rawLine.slice(0, separatorIndex);
    const value =
      separatorIndex === -1
        ? ""
        : rawLine.slice(separatorIndex + 1).replace(/^ /, "");

    if (field === "data") message.data += `${value}\n`;
    if (field === "event") message.event = value;
    if (field === "id") message.id = value;
    if (field === "retry") {
      const retry = Number(value);
      if (Number.isFinite(retry) && retry >= 0) message.retry = retry;
    }
  }

  message.data = message.data.replace(/\n$/, "");
  return message.data || message.event || message.id ? message : null;
}

export async function* readSseMessages(
  response: Response,
): AsyncGenerator<SseMessage> {
  if (!response.body) {
    throw new TxlineDiagnosticError({
      code: "TXLINE_SSE_ERROR",
      message: "TxLINE scores stream returned no response body.",
      hint: "Confirm the endpoint is the authenticated scores SSE endpoint.",
      endpoint: "/scores/stream",
    });
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let separator = buffer.match(/\r?\n\r?\n/);
      while (separator?.index !== undefined) {
        const block = buffer.slice(0, separator.index);
        buffer = buffer.slice(separator.index + separator[0].length);
        const message = parseSseBlock(block);
        if (message) yield message;
        separator = buffer.match(/\r?\n\r?\n/);
      }
    }

    buffer += decoder.decode();
    const message = parseSseBlock(buffer);
    if (message) yield message;
  } finally {
    reader.releaseLock();
  }
}

type FixtureSequenceState = {
  lastSequence: number;
  pending: Map<number, MatchScoreRecord>;
};

export type ScoreSequenceResult = {
  records: MatchScoreRecord[];
  duplicate: boolean;
  gapDetected: boolean;
};

export class ScoreSequenceTracker {
  readonly #states = new Map<string, FixtureSequenceState>();
  readonly #startingSequences: Record<string, number>;
  readonly #maxPendingPerFixture: number;

  constructor(
    startingSequences: Record<string, number> = {},
    maxPendingPerFixture = 128,
  ) {
    this.#startingSequences = { ...startingSequences };
    this.#maxPendingPerFixture = maxPendingPerFixture;
  }

  push(record: MatchScoreRecord): ScoreSequenceResult {
    let state = this.#states.get(record.fixtureId);
    if (!state) {
      const configuredSequence = this.#startingSequences[record.fixtureId];
      if (configuredSequence === undefined) {
        this.#states.set(record.fixtureId, {
          lastSequence: record.sequence,
          pending: new Map(),
        });
        return { records: [record], duplicate: false, gapDetected: false };
      }
      state = { lastSequence: configuredSequence, pending: new Map() };
      this.#states.set(record.fixtureId, state);
    }

    if (
      record.sequence <= state.lastSequence ||
      state.pending.has(record.sequence)
    ) {
      return { records: [], duplicate: true, gapDetected: false };
    }

    state.pending.set(record.sequence, record);
    const records: MatchScoreRecord[] = [];
    let next = state.pending.get(state.lastSequence + 1);
    while (next) {
      state.pending.delete(next.sequence);
      state.lastSequence = next.sequence;
      records.push(next);
      next = state.pending.get(state.lastSequence + 1);
    }

    let gapDetected = false;
    if (state.pending.size > this.#maxPendingPerFixture) {
      const lowestSequence = Math.min(...state.pending.keys());
      const lowest = state.pending.get(lowestSequence);
      if (lowest) {
        gapDetected = true;
        state.pending.delete(lowestSequence);
        state.lastSequence = lowestSequence;
        records.push(lowest);
        next = state.pending.get(state.lastSequence + 1);
        while (next) {
          state.pending.delete(next.sequence);
          state.lastSequence = next.sequence;
          records.push(next);
          next = state.pending.get(state.lastSequence + 1);
        }
      }
    }

    return { records, duplicate: false, gapDetected };
  }
}

export type ScoreStreamOptions = {
  signal?: AbortSignal;
  fixtureId?: string;
  startingSequences?: Record<string, number>;
  maxPendingPerFixture?: number;
  maxReconnectAttempts?: number;
  reconnectBaseDelayMs?: number;
  reconnectMaxDelayMs?: number;
  telemetry?: TxlineTelemetrySink;
};

type InternalScoreStreamOptions = ScoreStreamOptions & {
  client: TxlineApiClient;
};

function abortableDelay(milliseconds: number, signal?: AbortSignal) {
  if (signal?.aborted) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, milliseconds);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

function isTerminalStreamError(error: unknown) {
  return (
    error instanceof TxlineDiagnosticError &&
    [
      "TXLINE_ACCESS_DENIED",
      "TXLINE_INVALID_INPUT",
      "TXLINE_JWT_EXPIRED",
      "TXLINE_NETWORK_MISMATCH",
    ].includes(error.code)
  );
}

export async function* streamNormalizedScores(
  options: InternalScoreStreamOptions,
): AsyncGenerator<MatchScoreRecord> {
  if (options.fixtureId && !/^[1-9]\d*$/.test(options.fixtureId)) {
    throw new TxlineDiagnosticError({
      code: "TXLINE_INVALID_INPUT",
      message: "Score stream fixture ID must be a positive decimal string.",
      hint: "Use a fixture ID returned by the normalized fixture adapter.",
    });
  }
  const tracker = new ScoreSequenceTracker(
    options.startingSequences,
    options.maxPendingPerFixture,
  );
  const maxReconnectAttempts = options.maxReconnectAttempts ?? Infinity;
  const reconnectBaseDelayMs = options.reconnectBaseDelayMs ?? 500;
  const reconnectMaxDelayMs = options.reconnectMaxDelayMs ?? 10_000;
  let reconnectAttempt = 0;
  let lastEventId: string | undefined;

  while (!options.signal?.aborted) {
    try {
      const response = await options.client.openEventStream("/scores/stream", {
        signal: options.signal,
        lastEventId,
      });
      emitTxlineTelemetry(options.telemetry, {
        kind: "stream",
        operation: "scores.connect",
        outcome: "success",
        endpoint: "/scores/stream",
        attempt: reconnectAttempt,
        status: response.status,
      });

      for await (const message of readSseMessages(response)) {
        if (options.signal?.aborted) return;
        if (message.id) lastEventId = message.id;
        if (!message.data) continue;

        let raw: unknown;
        try {
          raw = JSON.parse(message.data) as unknown;
        } catch {
          emitTxlineTelemetry(options.telemetry, {
            kind: "normalization",
            operation: "scores.stream-json",
            outcome: "error",
            endpoint: "/scores/stream",
            code: "INVALID_JSON",
          });
          continue;
        }

        let record: MatchScoreRecord;
        try {
          record = normalizeScore(raw);
        } catch (error) {
          emitTxlineTelemetry(options.telemetry, {
            kind: "normalization",
            operation: "scores.stream-record",
            outcome: "error",
            endpoint: "/scores/stream",
            code:
              error instanceof TxlineDiagnosticError
                ? error.code
                : "NORMALIZATION_ERROR",
          });
          continue;
        }
        if (options.fixtureId && record.fixtureId !== options.fixtureId)
          continue;
        reconnectAttempt = 0;
        const result = tracker.push(record);
        if (result.duplicate) {
          emitTxlineTelemetry(options.telemetry, {
            kind: "stream",
            operation: "scores.sequence",
            outcome: "duplicate",
            endpoint: "/scores/stream",
          });
        }
        if (result.gapDetected) {
          emitTxlineTelemetry(options.telemetry, {
            kind: "stream",
            operation: "scores.sequence-gap",
            outcome: "retry",
            endpoint: "/scores/stream",
            code: "PENDING_BUFFER_LIMIT",
          });
        }
        for (const orderedRecord of result.records) yield orderedRecord;
      }
    } catch (error) {
      if (options.signal?.aborted) return;
      emitTxlineTelemetry(options.telemetry, {
        kind: "stream",
        operation: "scores.disconnect",
        outcome: "error",
        endpoint: "/scores/stream",
        attempt: reconnectAttempt,
        code:
          error instanceof TxlineDiagnosticError ? error.code : "STREAM_ERROR",
      });
      if (isTerminalStreamError(error)) throw error;
    }

    if (options.signal?.aborted) return;
    reconnectAttempt += 1;
    if (reconnectAttempt > maxReconnectAttempts) {
      throw new TxlineDiagnosticError({
        code: "TXLINE_SSE_ERROR",
        message: `TxLINE scores stream exhausted ${maxReconnectAttempts} reconnect attempts.`,
        hint: "Renew the guest JWT, verify the API token/network, and resume from the last processed sequence.",
        endpoint: "/scores/stream",
      });
    }
    const delay = Math.min(
      reconnectMaxDelayMs,
      reconnectBaseDelayMs * 2 ** Math.max(0, reconnectAttempt - 1),
    );
    emitTxlineTelemetry(options.telemetry, {
      kind: "stream",
      operation: "scores.reconnect",
      outcome: "retry",
      endpoint: "/scores/stream",
      attempt: reconnectAttempt,
    });
    await abortableDelay(delay, options.signal);
  }
}

export async function connectScoresStream(options: {
  config: TxlineNetworkConfig;
  credentials: TxlineCredentials;
  timeoutMs?: number;
}) {
  const timeoutMs = options.timeoutMs ?? 15_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const streamUrl = `${options.config.apiBaseUrl}/scores/stream`;

  try {
    const client = new TxlineApiClient(options.config, options.credentials);
    const response = await client.openEventStream("/scores/stream", {
      signal: controller.signal,
    });
    await response.body?.cancel();
    return { connectedAt: new Date().toISOString(), streamUrl };
  } catch (cause) {
    throw new TxlineDiagnosticError({
      code: "TXLINE_SSE_ERROR",
      message: `TxLINE scores SSE did not open within ${timeoutMs}ms.`,
      hint: "Confirm both auth headers and the devnet host. No data messages is normal when no covered fixture is active, but the connection must open.",
      endpoint: "/scores/stream",
      cause,
    });
  } finally {
    clearTimeout(timer);
  }
}
