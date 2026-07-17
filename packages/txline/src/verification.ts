import { startGuestSession, TxlineApiClient } from "./client";
import { TxlineDiagnosticError } from "./errors";
import type { TxlineNetworkConfig } from "./network";
import type { StoredTxlineCredentials } from "./server";
import { connectScoresStream } from "./sse";

const DOCUMENTED_HISTORICAL_FIXTURES = [
  18_241_006, 18_237_038, 18_202_783, 18_179_550,
];

function objectRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

export function extractRecords(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    return value.map(objectRecord).filter((item) => item !== undefined);
  }

  const record = objectRecord(value);
  if (!record) return [];

  for (const key of [
    "data",
    "fixtures",
    "odds",
    "scores",
    "updates",
    "records",
  ]) {
    const nested = record[key];
    if (Array.isArray(nested)) return extractRecords(nested);
  }

  return [record];
}

export function readNumericField(
  record: Record<string, unknown>,
  names: string[],
) {
  for (const name of names) {
    const value = record[name];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
  }

  return undefined;
}

function unique(values: Array<number | undefined>) {
  return [
    ...new Set(values.filter((value) => value !== undefined)),
  ] as number[];
}

function canTryNext(error: unknown) {
  return (
    error instanceof TxlineDiagnosticError &&
    (error.status === 400 || error.status === 404 || error.status === 422)
  );
}

export type TxlineVerificationReport = {
  verifiedAt: string;
  network: "devnet";
  apiOrigin: string;
  programId: string;
  tokenMint: string;
  walletPublicKey: string;
  fixtureSnapshot: {
    competitionId: number;
    recordCount: number;
  };
  odds: { fixtureId: number; asOf?: number; recordCount: number };
  scoresSnapshot: { fixtureId: number; recordCount: number };
  historicalScores: {
    fixtureId: number;
    recordCount: number;
    sequence: number;
  };
  proof: { fixtureId: number; sequence: number; statKey: number };
  scoresSse: { connectedAt: string };
};

export async function verifyTxlineDataPaths(options: {
  config: TxlineNetworkConfig;
  credentials: StoredTxlineCredentials;
  fixtureCompetitionId?: number;
  fixtureStartEpochDay?: number;
  sseTimeoutMs?: number;
}) {
  const { config, credentials } = options;
  const renewGuestJwt = async () => {
    credentials.guestJwt = await startGuestSession(config);
    return credentials.guestJwt;
  };
  const client = new TxlineApiClient(
    config,
    { apiToken: credentials.apiToken, guestJwt: credentials.guestJwt },
    { renewGuestJwt },
  );
  const competitionId = options.fixtureCompetitionId ?? 72;
  const startEpochDay =
    options.fixtureStartEpochDay ??
    Math.floor(Date.UTC(2026, 5, 1) / (24 * 60 * 60 * 1_000));
  const fixtureEndpoint = `/fixtures/snapshot?competitionId=${competitionId}&startEpochDay=${startEpochDay}`;
  const fixtures = extractRecords(await client.getJson(fixtureEndpoint));
  if (fixtures.length === 0) {
    throw new TxlineDiagnosticError({
      code: "TXLINE_INVALID_RESPONSE",
      message: "The World Cup fixture snapshot returned no covered fixtures.",
      hint: "Confirm competition 72 coverage and choose a start epoch day within the current World Cup schedule.",
      endpoint: fixtureEndpoint,
    });
  }
  const fixtureIds = unique([
    ...fixtures.map((fixture) =>
      readNumericField(fixture, ["FixtureId", "fixtureId", "fixture_id", "id"]),
    ),
    ...DOCUMENTED_HISTORICAL_FIXTURES,
  ]);
  const historyFixtureIds = unique([
    ...DOCUMENTED_HISTORICAL_FIXTURES,
    ...fixtureIds,
  ]);

  const oddsCandidates: Array<{ fixtureId: number; asOf?: number }> = [
    ...fixtures
      .map((fixture) => ({
        fixtureId: readNumericField(fixture, [
          "FixtureId",
          "fixtureId",
          "fixture_id",
          "id",
        ]),
        asOf: readNumericField(fixture, ["StartTime", "startTime"]),
      }))
      .filter(
        (
          candidate,
        ): candidate is { fixtureId: number; asOf: number | undefined } =>
          candidate.fixtureId !== undefined,
      ),
    ...DOCUMENTED_HISTORICAL_FIXTURES.map((fixtureId) => ({ fixtureId })),
  ];

  let oddsResult:
    | {
        fixtureId: number;
        asOf?: number;
        records: Record<string, unknown>[];
      }
    | undefined;
  for (const candidate of oddsCandidates) {
    try {
      const endpoint = `/odds/snapshot/${candidate.fixtureId}${candidate.asOf ? `?asOf=${candidate.asOf}` : ""}`;
      const records = extractRecords(await client.getJson(endpoint));
      if (records.length > 0) {
        oddsResult = { ...candidate, records };
        break;
      }
    } catch (error) {
      if (!canTryNext(error)) throw error;
    }
  }

  if (!oddsResult) {
    throw new TxlineDiagnosticError({
      code: "TXLINE_INVALID_RESPONSE",
      message: "No covered fixture with an odds snapshot could be found.",
      hint: "Confirm competition 72 coverage and update the documented fixture fallbacks from the current TxLINE schedule.",
      endpoint: "/odds/snapshot/{fixtureId}",
    });
  }

  let historyResult:
    | {
        fixtureId: number;
        records: Record<string, unknown>[];
        snapshotRecords: Record<string, unknown>[];
        sequence: number;
      }
    | undefined;
  for (const fixtureId of historyFixtureIds) {
    try {
      const records = extractRecords(
        await client.getJson(`/scores/historical/${fixtureId}`),
      );
      const sequence = records
        .map((record) => readNumericField(record, ["Seq", "seq", "sequence"]))
        .findLast((value) => value !== undefined && value > 0);
      if (records.length > 0 && sequence !== undefined) {
        const snapshotRecords = extractRecords(
          await client.getJson(`/scores/snapshot/${fixtureId}`),
        );
        if (snapshotRecords.length > 0) {
          historyResult = { fixtureId, records, snapshotRecords, sequence };
          break;
        }
      }
    } catch (error) {
      if (!canTryNext(error)) throw error;
    }
  }

  if (!historyResult) {
    throw new TxlineDiagnosticError({
      code: "TXLINE_INVALID_RESPONSE",
      message: "No historical score sequence could be found.",
      hint: "Use a completed fixture from the TxLINE scores schedule and retain its observed Seq/seq value.",
      endpoint: "/scores/historical/{fixtureId}",
    });
  }

  let proofResult: { statKey: number } | undefined;
  for (const statKey of [1, 1002, 2]) {
    const endpoint = `/scores/stat-validation?fixtureId=${historyResult.fixtureId}&seq=${historyResult.sequence}&statKeys=${statKey}`;
    try {
      const proof = objectRecord(await client.getJson(endpoint));
      if (proof && Object.keys(proof).length > 0) {
        proofResult = { statKey };
        break;
      }
    } catch (error) {
      if (!canTryNext(error)) throw error;
    }
  }

  if (!proofResult) {
    throw new TxlineDiagnosticError({
      code: "TXLINE_INVALID_SEQUENCE",
      message:
        "TxLINE did not return a proof for the observed historical sequence.",
      hint: "Try another non-zero historical sequence and a stat key present in that score record.",
      endpoint: "/scores/stat-validation",
    });
  }

  const scoresSse = await connectScoresStream({
    config,
    credentials: client.credentials,
    timeoutMs: options.sseTimeoutMs,
  });

  return {
    verifiedAt: new Date().toISOString(),
    network: "devnet",
    apiOrigin: config.apiOrigin,
    programId: config.programId,
    tokenMint: config.tokenMint,
    walletPublicKey: credentials.walletPublicKey,
    fixtureSnapshot: { competitionId, recordCount: fixtures.length },
    odds: {
      fixtureId: oddsResult.fixtureId,
      asOf: oddsResult.asOf,
      recordCount: oddsResult.records.length,
    },
    scoresSnapshot: {
      fixtureId: historyResult.fixtureId,
      recordCount: historyResult.snapshotRecords.length,
    },
    historicalScores: {
      fixtureId: historyResult.fixtureId,
      recordCount: historyResult.records.length,
      sequence: historyResult.sequence,
    },
    proof: {
      fixtureId: historyResult.fixtureId,
      sequence: historyResult.sequence,
      statKey: proofResult.statKey,
    },
    scoresSse: { connectedAt: scoresSse.connectedAt },
  } satisfies TxlineVerificationReport;
}
