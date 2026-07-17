import type {
  MatchFixture,
  MatchOddsMarket,
  MatchScoreRecord,
} from "@proof-play/domain";
import { TxlineApiClient } from "./client";
import { TxlineDiagnosticError } from "./errors";
import {
  normalizeFixture,
  normalizeOdds,
  normalizeScore,
  normalizeScoreProof,
  unwrapTxlineRecords,
} from "./normalizers";
import { streamNormalizedScores, type ScoreStreamOptions } from "./sse";
import { emitTxlineTelemetry, type TxlineTelemetrySink } from "./telemetry";
import type {
  FixtureQuery,
  TxlineAdapterContract,
  TxlineScoreProof,
} from "./types";

export type TxlineAdapterOptions = {
  telemetry?: TxlineTelemetrySink;
};

function invalidInput(message: string) {
  return new TxlineDiagnosticError({
    code: "TXLINE_INVALID_INPUT",
    message,
    hint: "Use decimal TxLINE identifiers and observed positive score sequences.",
  });
}

export function assertFixtureId(value: string) {
  if (!/^[1-9]\d*$/.test(value)) {
    throw invalidInput("Fixture ID must be a positive decimal string.");
  }
  return value;
}

function assertOptionalInteger(
  value: number | undefined,
  label: string,
  options: { min?: number; max?: number } = {},
) {
  if (value === undefined) return;
  if (
    !Number.isSafeInteger(value) ||
    value < (options.min ?? 0) ||
    value > (options.max ?? Number.MAX_SAFE_INTEGER)
  ) {
    throw invalidInput(`${label} is outside its supported integer range.`);
  }
}

function queryString(values: Record<string, number | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

function sortedScores(records: MatchScoreRecord[]) {
  return records.sort(
    (left, right) =>
      left.fixtureId.localeCompare(right.fixtureId) ||
      left.sequence - right.sequence ||
      left.sourceUpdatedAt.localeCompare(right.sourceUpdatedAt),
  );
}

export class TxlineAdapter implements TxlineAdapterContract {
  readonly client: TxlineApiClient;
  readonly #telemetry?: TxlineTelemetrySink;

  constructor(client: TxlineApiClient, options: TxlineAdapterOptions = {}) {
    this.client = client;
    this.#telemetry = options.telemetry;
  }

  async listFixtures(query: FixtureQuery = {}) {
    assertOptionalInteger(query.competitionId, "Competition ID", { min: 1 });
    assertOptionalInteger(query.startEpochDay, "Fixture start epoch day");
    const endpoint = `/fixtures/snapshot${queryString(query)}`;
    return this.#normalizeCollection(
      "fixtures.snapshot",
      endpoint,
      await this.client.getJson(endpoint),
      normalizeFixture,
    );
  }

  async getFixture(fixtureId: string, query: FixtureQuery = {}) {
    assertFixtureId(fixtureId);
    const fixture = (await this.listFixtures(query)).find(
      (candidate) => candidate.fixtureId === fixtureId,
    );
    if (!fixture) {
      throw new TxlineDiagnosticError({
        code: "TXLINE_NOT_FOUND",
        message: `Fixture ${fixtureId} is not present in the requested snapshot window.`,
        hint: "Provide a startEpochDay within the fixture snapshot's supported 30-day window.",
        endpoint: "/fixtures/snapshot",
        status: 404,
      });
    }
    return fixture;
  }

  async getOddsSnapshot(fixtureId: string, options: { asOf?: number } = {}) {
    assertFixtureId(fixtureId);
    assertOptionalInteger(options.asOf, "Odds asOf timestamp", { min: 1 });
    const endpoint = `/odds/snapshot/${fixtureId}${queryString(options)}`;
    return this.#normalizeCollection(
      "odds.snapshot",
      endpoint,
      await this.client.getJson(endpoint),
      normalizeOdds,
    );
  }

  async getOddsUpdates(fixtureId: string) {
    assertFixtureId(fixtureId);
    const endpoint = `/odds/updates/${fixtureId}`;
    return this.#normalizeCollection(
      "odds.updates",
      endpoint,
      await this.client.getJson(endpoint),
      normalizeOdds,
    );
  }

  async getScoreSnapshot(fixtureId: string, options: { asOf?: number } = {}) {
    assertFixtureId(fixtureId);
    assertOptionalInteger(options.asOf, "Score asOf timestamp", { min: 1 });
    const endpoint = `/scores/snapshot/${fixtureId}${queryString(options)}`;
    return sortedScores(
      await this.#normalizeCollection(
        "scores.snapshot",
        endpoint,
        await this.client.getJson(endpoint),
        normalizeScore,
      ),
    );
  }

  async getScoreUpdates(fixtureId: string) {
    assertFixtureId(fixtureId);
    const endpoint = `/scores/updates/${fixtureId}`;
    return sortedScores(
      await this.#normalizeCollection(
        "scores.updates",
        endpoint,
        await this.client.getJson(endpoint),
        normalizeScore,
      ),
    );
  }

  async getHistoricalScores(fixtureId: string) {
    assertFixtureId(fixtureId);
    const endpoint = `/scores/historical/${fixtureId}`;
    return sortedScores(
      await this.#normalizeCollection(
        "scores.historical",
        endpoint,
        await this.client.getJson(endpoint),
        normalizeScore,
      ),
    );
  }

  async getScoreProof(input: {
    fixtureId: string;
    sequence: number;
    statKeys: number[];
  }): Promise<TxlineScoreProof> {
    const fixtureId = assertFixtureId(input.fixtureId);
    if (!Number.isSafeInteger(input.sequence) || input.sequence <= 0) {
      throw new TxlineDiagnosticError({
        code: "TXLINE_INVALID_SEQUENCE",
        message: "A score proof requires a positive observed sequence.",
        hint: "Read Seq/seq from a TxLINE snapshot, update, history record, or score stream; never use zero or a synthetic value.",
      });
    }
    if (
      input.statKeys.length === 0 ||
      input.statKeys.some(
        (key) => !Number.isSafeInteger(key) || key <= 0 || key > 2_147_483_647,
      ) ||
      new Set(input.statKeys).size !== input.statKeys.length
    ) {
      throw invalidInput(
        "Proof stat keys must be a non-empty list of unique positive integers.",
      );
    }
    const params = new URLSearchParams({
      fixtureId,
      seq: String(input.sequence),
      statKeys: input.statKeys.join(","),
    });
    const endpoint = `/scores/stat-validation?${params}`;
    const startedAt = Date.now();
    try {
      const proof = normalizeScoreProof(await this.client.getJson(endpoint), {
        fixtureId,
        sequence: input.sequence,
        statKeys: input.statKeys,
      });
      emitTxlineTelemetry(this.#telemetry, {
        kind: "normalization",
        operation: "scores.proof",
        outcome: "success",
        endpoint: "/scores/stat-validation",
        durationMs: Date.now() - startedAt,
        recordCount: proof.stats.length,
      });
      return proof;
    } catch (error) {
      emitTxlineTelemetry(this.#telemetry, {
        kind: "normalization",
        operation: "scores.proof",
        outcome: "error",
        endpoint: "/scores/stat-validation",
        durationMs: Date.now() - startedAt,
        code:
          error instanceof TxlineDiagnosticError
            ? error.code
            : "NORMALIZATION_ERROR",
      });
      throw error;
    }
  }

  streamScores(options: ScoreStreamOptions = {}) {
    return streamNormalizedScores({
      ...options,
      client: this.client,
      telemetry: options.telemetry ?? this.#telemetry,
    });
  }

  async #normalizeCollection<T>(
    operation: string,
    endpoint: string,
    value: unknown,
    normalize: (item: unknown) => T,
  ): Promise<T[]> {
    const startedAt = Date.now();
    try {
      const records = unwrapTxlineRecords(value).map(normalize);
      emitTxlineTelemetry(this.#telemetry, {
        kind: "normalization",
        operation,
        outcome: "success",
        endpoint,
        durationMs: Date.now() - startedAt,
        recordCount: records.length,
      });
      return records;
    } catch (error) {
      emitTxlineTelemetry(this.#telemetry, {
        kind: "normalization",
        operation,
        outcome: "error",
        endpoint,
        durationMs: Date.now() - startedAt,
        code:
          error instanceof TxlineDiagnosticError
            ? error.code
            : "NORMALIZATION_ERROR",
      });
      throw error;
    }
  }
}

export type {
  MatchFixture,
  MatchOddsMarket,
  MatchScoreRecord,
  ScoreStreamOptions,
};
