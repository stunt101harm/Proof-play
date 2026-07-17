import {
  SPORTS_DATA_SCHEMA_VERSION,
  type MatchFixture,
  type MatchLifecycle,
  type MatchOddsMarket,
  type MatchScoreRecord,
  type ParticipantScore,
  type ScoreAmendment,
} from "@proof-play/domain";
import { TxlineDiagnosticError } from "./errors";
import type { TxlineHash, TxlineProofNode, TxlineScoreProof } from "./types";

type UnknownRecord = Record<string, unknown>;

export function asRecord(value: unknown): UnknownRecord | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as UnknownRecord)
    : undefined;
}

function field(record: UnknownRecord, names: string[]) {
  for (const name of names) {
    if (name in record) return record[name];
  }
  return undefined;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function integerValue(value: unknown) {
  const parsed = numberValue(value);
  return parsed !== undefined && Number.isSafeInteger(parsed)
    ? parsed
    : undefined;
}

function booleanValue(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
}

function requiredRecord(value: unknown, label: string) {
  const record = asRecord(value);
  if (!record) throw normalizationError(`${label} must be an object.`);
  return record;
}

function requiredString(record: UnknownRecord, names: string[], label: string) {
  const value = stringValue(field(record, names));
  if (value === undefined)
    throw normalizationError(`${label} must be a non-empty string.`);
  return value;
}

function requiredInteger(
  record: UnknownRecord,
  names: string[],
  label: string,
) {
  const value = integerValue(field(record, names));
  if (value === undefined)
    throw normalizationError(`${label} must be a safe integer.`);
  return value;
}

function decimalId(value: unknown, label: string, allowZero = false) {
  if (typeof value === "string") {
    const normalized = value.trim();
    if (
      /^(0|[1-9]\d*)$/.test(normalized) &&
      (allowZero || normalized !== "0")
    ) {
      return normalized;
    }
  }
  const parsed = integerValue(value);
  if (parsed === undefined || (allowZero ? parsed < 0 : parsed <= 0)) {
    throw normalizationError(`${label} must be a positive decimal identifier.`);
  }
  return String(parsed);
}

function isoTimestamp(value: unknown, label: string) {
  const timestamp = integerValue(value);
  if (timestamp === undefined || timestamp <= 0) {
    throw normalizationError(
      `${label} must be a positive Unix timestamp in ms.`,
    );
  }
  const iso = new Date(timestamp).toISOString();
  if (iso === "Invalid Date") throw normalizationError(`${label} is invalid.`);
  return iso;
}

function optionalIsoTimestamp(value: unknown) {
  const timestamp = integerValue(value);
  return timestamp !== undefined && timestamp > 0
    ? new Date(timestamp).toISOString()
    : null;
}

function normalizationError(message: string, cause?: unknown) {
  return new TxlineDiagnosticError({
    code: "TXLINE_NORMALIZATION_ERROR",
    message,
    hint: "Inspect the redacted TxLINE response shape and update the versioned normalizer before consuming it.",
    cause,
  });
}

export function unwrapTxlineRecords(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  const record = asRecord(value);
  if (!record) return [];

  for (const key of [
    "data",
    "fixtures",
    "odds",
    "scores",
    "updates",
    "records",
  ]) {
    if (Array.isArray(record[key])) return record[key];
  }
  return [record];
}

export function normalizeFixture(value: unknown): MatchFixture {
  const record = requiredRecord(value, "Fixture");
  const participant1IsHome = booleanValue(
    field(record, ["Participant1IsHome", "participant1IsHome"]),
  );
  if (participant1IsHome === undefined) {
    throw normalizationError("Fixture participant1IsHome must be a boolean.");
  }
  const gameState = field(record, ["GameState", "gameState"]);
  const normalizedState = stringValue(gameState)?.toLowerCase();
  const numericState = integerValue(gameState);
  const lifecycle =
    normalizedState === "cancelled" ||
    normalizedState === "canceled" ||
    numericState === 6
      ? "unavailable"
      : normalizedState && normalizedState !== "scheduled"
        ? "unknown"
        : "scheduled";

  return {
    schemaVersion: SPORTS_DATA_SCHEMA_VERSION,
    source: "txline",
    fixtureId: decimalId(
      field(record, ["FixtureId", "fixtureId"]),
      "Fixture ID",
    ),
    competition: {
      id: decimalId(
        field(record, ["CompetitionId", "competitionId"]),
        "Competition ID",
      ),
      name: requiredString(
        record,
        ["Competition", "competition"],
        "Competition name",
      ),
    },
    fixtureGroupId: decimalId(
      field(record, ["FixtureGroupId", "fixtureGroupId"]),
      "Fixture group ID",
    ),
    startsAt: isoTimestamp(
      field(record, ["StartTime", "startTime"]),
      "Fixture start time",
    ),
    sourceUpdatedAt: isoTimestamp(
      field(record, ["Ts", "ts"]),
      "Fixture timestamp",
    ),
    lifecycle,
    participants: [
      {
        position: 1,
        id: decimalId(
          field(record, ["Participant1Id", "participant1Id"]),
          "Participant 1 ID",
        ),
        name: requiredString(
          record,
          ["Participant1", "participant1"],
          "Participant 1 name",
        ),
        designation: participant1IsHome ? "home" : "away",
      },
      {
        position: 2,
        id: decimalId(
          field(record, ["Participant2Id", "participant2Id"]),
          "Participant 2 ID",
        ),
        name: requiredString(
          record,
          ["Participant2", "participant2"],
          "Participant 2 name",
        ),
        designation: participant1IsHome ? "away" : "home",
      },
    ],
  };
}

export function normalizeOdds(value: unknown): MatchOddsMarket {
  const record = requiredRecord(value, "Odds record");
  const names = field(record, ["PriceNames", "priceNames"]);
  const prices = field(record, ["Prices", "prices"]);
  const percentages = field(record, ["Pct", "pct"]);
  const nameList = Array.isArray(names) ? names : [];
  const priceList = Array.isArray(prices) ? prices : [];
  const percentageList = Array.isArray(percentages) ? percentages : [];
  const outcomeCount = Math.max(
    nameList.length,
    priceList.length,
    percentageList.length,
  );

  return {
    schemaVersion: SPORTS_DATA_SCHEMA_VERSION,
    source: "txline",
    fixtureId: decimalId(
      field(record, ["FixtureId", "fixtureId"]),
      "Odds fixture ID",
    ),
    messageId: requiredString(
      record,
      ["MessageId", "messageId"],
      "Odds message ID",
    ),
    sourceUpdatedAt: isoTimestamp(
      field(record, ["Ts", "ts"]),
      "Odds timestamp",
    ),
    bookmaker: {
      id: decimalId(
        field(record, ["BookmakerId", "bookmakerId"]),
        "Bookmaker ID",
      ),
      name: requiredString(
        record,
        ["Bookmaker", "bookmaker"],
        "Bookmaker name",
      ),
    },
    marketType: requiredString(
      record,
      ["SuperOddsType", "superOddsType"],
      "Odds market type",
    ),
    marketPeriod:
      stringValue(field(record, ["MarketPeriod", "marketPeriod"])) ?? null,
    marketParameters:
      stringValue(field(record, ["MarketParameters", "marketParameters"])) ??
      null,
    gameState: stringValue(field(record, ["GameState", "gameState"])) ?? null,
    inRunning: booleanValue(field(record, ["InRunning", "inRunning"])) ?? false,
    outcomes: Array.from({ length: outcomeCount }, (_, index) => {
      const probability = numberValue(percentageList[index]);
      return {
        key: stringValue(nameList[index]) ?? `outcome-${index + 1}`,
        rawPrice: integerValue(priceList[index]) ?? null,
        probabilityPercent: probability ?? null,
      };
    }),
  };
}

function normalizedStats(record: UnknownRecord) {
  const rawStats = asRecord(field(record, ["Stats", "stats"]));
  if (!rawStats) return {};

  return Object.fromEntries(
    Object.entries(rawStats)
      .map(([key, value]) => [key, integerValue(value)] as const)
      .filter((entry): entry is [string, number] => entry[1] !== undefined)
      .sort(([left], [right]) => Number(left) - Number(right)),
  );
}

function scoreFromStats(stats: Record<string, number>, participant: 1 | 2) {
  const offset = participant === 1 ? 0 : 1;
  return {
    goals: stats[String(1 + offset)] ?? null,
    yellowCards: stats[String(3 + offset)] ?? null,
    redCards: stats[String(5 + offset)] ?? null,
    corners: stats[String(7 + offset)] ?? null,
  } satisfies ParticipantScore;
}

function scalarRecord(value: unknown) {
  const record = asRecord(value);
  if (!record) return null;
  const scalars = Object.entries(record).filter(
    (entry): entry is [string, string | number | boolean | null] =>
      entry[1] === null ||
      typeof entry[1] === "string" ||
      typeof entry[1] === "number" ||
      typeof entry[1] === "boolean",
  );
  return scalars.length > 0 ? Object.fromEntries(scalars) : null;
}

function normalizeAmendment(record: UnknownRecord, action: string) {
  if (action.toLowerCase() !== "action_amend") return null;
  const data = asRecord(field(record, ["Data", "data"]));
  if (!data) return null;

  return {
    targetAction:
      stringValue(field(data, ["Action", "action"]))?.toLowerCase() ?? null,
    previous: scalarRecord(field(data, ["Previous", "previous"])),
    next: scalarRecord(field(data, ["New", "new"])),
  } satisfies ScoreAmendment;
}

function scoreLifecycle(
  action: string,
  statusId: number | null,
  gameState: string | null,
): MatchLifecycle {
  if (action.toLowerCase() === "game_finalised" && statusId === 100) {
    return "finalized";
  }
  if (statusId !== null) {
    if ([2, 4, 7, 9, 12].includes(statusId)) return "live";
    if ([3, 6, 8, 11, 14, 18].includes(statusId)) return "paused";
    if ([5, 10, 13].includes(statusId)) return "finalizing";
    if ([15, 16, 17, 19].includes(statusId)) return "unavailable";
    if (statusId === 1) return "scheduled";
  }
  const state = gameState?.toLowerCase();
  if (state === "scheduled") return "scheduled";
  if (state === "live" || state === "inplay" || state === "in-play") {
    return "live";
  }
  if (
    ["cancelled", "canceled", "abandoned", "postponed"].includes(state ?? "")
  ) {
    return "unavailable";
  }
  return "unknown";
}

export function normalizeScore(value: unknown): MatchScoreRecord {
  const record = requiredRecord(value, "Score record");
  const action = requiredString(record, ["Action", "action"], "Score action");
  const sequence = requiredInteger(
    record,
    ["Seq", "seq", "sequence"],
    "Score sequence",
  );
  if (sequence < 0)
    throw normalizationError("Score sequence cannot be negative.");
  const statusId =
    integerValue(field(record, ["StatusId", "statusId"])) ?? null;
  const period = integerValue(field(record, ["Period", "period"])) ?? null;
  const gameState =
    stringValue(field(record, ["GameState", "gameState"])) ?? null;
  const stats = normalizedStats(record);
  const participant = integerValue(
    field(record, ["Participant", "participant"]),
  );
  const rawClock = asRecord(field(record, ["Clock", "clock"]));
  const isFinal = action.toLowerCase() === "game_finalised" && statusId === 100;

  return {
    schemaVersion: SPORTS_DATA_SCHEMA_VERSION,
    source: "txline",
    fixtureId: decimalId(
      field(record, ["FixtureId", "fixtureId"]),
      "Score fixture ID",
    ),
    sequence,
    sourceUpdatedAt: isoTimestamp(
      field(record, ["Ts", "ts"]),
      "Score timestamp",
    ),
    startsAt: optionalIsoTimestamp(field(record, ["StartTime", "startTime"])),
    action: action.toLowerCase(),
    gameState,
    lifecycle: scoreLifecycle(action, statusId, gameState),
    statusId,
    period,
    participant: participant === 1 || participant === 2 ? participant : null,
    participant1IsHome:
      booleanValue(
        field(record, ["Participant1IsHome", "participant1IsHome"]),
      ) ?? null,
    clock: rawClock
      ? {
          running:
            booleanValue(field(rawClock, ["Running", "running"])) ?? null,
          seconds:
            integerValue(field(rawClock, ["Seconds", "seconds"])) ?? null,
        }
      : null,
    score: {
      participant1: scoreFromStats(stats, 1),
      participant2: scoreFromStats(stats, 2),
    },
    stats,
    amendment: normalizeAmendment(record, action),
    isFinal,
  };
}

function normalizeHash(value: unknown, label: string): TxlineHash {
  if (typeof value === "string" && value.length > 0) return value;
  if (
    Array.isArray(value) &&
    value.length === 32 &&
    value.every(
      (byte) =>
        Number.isInteger(byte) && Number(byte) >= 0 && Number(byte) <= 255,
    )
  ) {
    return value.map(Number);
  }
  throw normalizationError(`${label} must be a 32-byte hash.`);
}

function normalizeProofNodes(value: unknown, label: string) {
  if (!Array.isArray(value))
    throw normalizationError(`${label} must be an array.`);
  return value.map((item, index) => {
    const node = requiredRecord(item, `${label}[${index}]`);
    const isRightSibling = booleanValue(
      field(node, ["isRightSibling", "IsRightSibling"]),
    );
    if (isRightSibling === undefined) {
      throw normalizationError(
        `${label}[${index}] must declare its sibling side.`,
      );
    }
    return {
      hash: normalizeHash(
        field(node, ["hash", "Hash"]),
        `${label}[${index}].hash`,
      ),
      isRightSibling,
    } satisfies TxlineProofNode;
  });
}

export function normalizeScoreProof(
  value: unknown,
  request: { fixtureId: string; sequence: number; statKeys: number[] },
): TxlineScoreProof {
  const record = requiredRecord(value, "Score proof");
  const summary = requiredRecord(
    field(record, ["summary", "Summary"]),
    "Score proof summary",
  );
  const updateStats = requiredRecord(
    field(summary, ["updateStats", "UpdateStats"]),
    "Score proof update stats",
  );
  const fixtureId = decimalId(
    field(summary, ["fixtureId", "FixtureId"]),
    "Proof fixture ID",
  );
  if (fixtureId !== request.fixtureId) {
    throw normalizationError(
      `Proof fixture ${fixtureId} does not match requested fixture ${request.fixtureId}.`,
    );
  }
  const rawStats = field(record, ["statsToProve", "StatsToProve"]);
  const legacyStat = field(record, ["statToProve", "StatToProve"]);
  const statValues = Array.isArray(rawStats)
    ? rawStats
    : legacyStat === undefined
      ? []
      : [legacyStat];
  const stats = statValues.map((item, index) => {
    const stat = requiredRecord(item, `Proof stat ${index}`);
    return {
      key: requiredInteger(stat, ["key", "Key"], "Proof stat key"),
      value: requiredInteger(stat, ["value", "Value"], "Proof stat value"),
      period: requiredInteger(stat, ["period", "Period"], "Proof stat period"),
    };
  });
  const returnedKeys = new Set(stats.map((stat) => stat.key));
  if (request.statKeys.some((key) => !returnedKeys.has(key))) {
    throw normalizationError(
      "Score proof does not cover every requested stat key.",
    );
  }
  const rawProofs = field(record, ["statProofs", "StatProofs"]);
  const legacyProof = field(record, ["statProof", "StatProof"]);
  const statProofs = Array.isArray(rawProofs)
    ? rawProofs.map((proof, index) =>
        normalizeProofNodes(proof, `Stat proof ${index}`),
      )
    : legacyProof === undefined
      ? []
      : [normalizeProofNodes(legacyProof, "Stat proof 0")];
  if (
    stats.length !== request.statKeys.length ||
    stats.some((stat, index) => stat.key !== request.statKeys[index]) ||
    statProofs.length !== stats.length
  ) {
    throw normalizationError(
      "Score proof stat values and proof branches do not match the requested key order.",
    );
  }

  return {
    fixtureId,
    sequence: request.sequence,
    requestedStatKeys: [...request.statKeys],
    sourceUpdatedAt: isoTimestamp(
      field(record, ["ts", "Ts"]),
      "Proof timestamp",
    ),
    stats,
    eventStatRoot: normalizeHash(
      field(record, ["eventStatRoot", "EventStatRoot"]),
      "Proof event-stat root",
    ),
    summary: {
      fixtureId,
      updateCount: requiredInteger(
        updateStats,
        ["updateCount", "UpdateCount"],
        "Proof update count",
      ),
      minTimestamp: requiredInteger(
        updateStats,
        ["minTimestamp", "MinTimestamp"],
        "Proof minimum timestamp",
      ),
      maxTimestamp: requiredInteger(
        updateStats,
        ["maxTimestamp", "MaxTimestamp"],
        "Proof maximum timestamp",
      ),
      eventStatsSubTreeRoot: normalizeHash(
        field(summary, ["eventStatsSubTreeRoot", "EventStatsSubTreeRoot"]),
        "Proof event-stat subtree root",
      ),
    },
    statProofs,
    subTreeProof: normalizeProofNodes(
      field(record, ["subTreeProof", "SubTreeProof"]),
      "Score subtree proof",
    ),
    mainTreeProof: normalizeProofNodes(
      field(record, ["mainTreeProof", "MainTreeProof"]),
      "Score main-tree proof",
    ),
  };
}
