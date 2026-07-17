import {
  CONDITION_SCHEMA_VERSION,
  type CanonicalConditionV1,
  type ConditionLegV1,
  type ParticipantPosition,
  type ThresholdComparison,
} from "@proof-play/domain";

import { canonicalizeJson, type JsonValue } from "./canonical";
import { ConditionCompilerError } from "./errors";

export const CONDITION_COMPILER_VERSION = 1 as const;

export const CONDITION_LIMITS = {
  maxLegs: 2,
  maxUniqueStatKeys: 4,
  maxGoalThreshold: 30,
  maxWinningMargin: 30,
  maxCornerThreshold: 60,
} as const;

export const CONDITION_TEMPLATES = [
  {
    kind: "participantWins",
    label: "Home or away wins",
    parameters: ["participant"],
  },
  {
    kind: "totalGoals",
    label: "Total goals over or under",
    parameters: ["comparison", "threshold"],
  },
  {
    kind: "bothTeamsScore",
    label: "Both teams score",
    parameters: [],
  },
  {
    kind: "winningMargin",
    label: "Winning margin",
    parameters: ["participant", "threshold"],
  },
  {
    kind: "totalCorners",
    label: "Total corners over or under",
    parameters: ["comparison", "threshold"],
  },
] as const;

const LEG_KIND_ORDER = [
  "participantWins",
  "winningMargin",
  "bothTeamsScore",
  "totalGoals",
  "totalCorners",
] as const satisfies readonly ConditionLegV1["kind"][];

const MAX_SIGNED_I64 = 9_223_372_036_854_775_807n;

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertExactKeys(
  record: UnknownRecord,
  expectedKeys: readonly string[],
  context: string,
): void {
  const actual = Object.keys(record).sort();
  const expected = [...expectedKeys].sort();

  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    throw new ConditionCompilerError(
      "INVALID_SCHEMA",
      `${context} must contain exactly: ${expected.join(", ")}.`,
    );
  }
}

function parseParticipant(
  value: unknown,
  context: string,
): ParticipantPosition {
  if (value !== 1 && value !== 2) {
    throw new ConditionCompilerError(
      "INVALID_SCHEMA",
      `${context} must be participant position 1 or 2.`,
    );
  }

  return value;
}

function parseComparison(value: unknown, context: string): ThresholdComparison {
  if (value !== "atLeast" && value !== "atMost") {
    throw new ConditionCompilerError(
      "INVALID_SCHEMA",
      `${context} must be atLeast or atMost.`,
    );
  }

  return value;
}

function parseThreshold(
  value: unknown,
  minimum: number,
  maximum: number,
  context: string,
): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new ConditionCompilerError(
      "INVALID_SCHEMA",
      `${context} must be an integer from ${minimum} through ${maximum}.`,
    );
  }

  return value;
}

function parseLeg(value: unknown, index: number): ConditionLegV1 {
  const context = `legs[${index}]`;
  if (!isRecord(value) || typeof value.kind !== "string") {
    throw new ConditionCompilerError(
      "INVALID_SCHEMA",
      `${context} must be a condition object with a kind.`,
    );
  }

  switch (value.kind) {
    case "participantWins":
      assertExactKeys(value, ["kind", "participant"], context);
      return {
        kind: "participantWins",
        participant: parseParticipant(
          value.participant,
          `${context}.participant`,
        ),
      };
    case "totalGoals":
      assertExactKeys(value, ["kind", "comparison", "threshold"], context);
      {
        const comparison = parseComparison(
          value.comparison,
          `${context}.comparison`,
        );
        const threshold = parseThreshold(
          value.threshold,
          0,
          CONDITION_LIMITS.maxGoalThreshold,
          `${context}.threshold`,
        );
        if (comparison === "atLeast" && threshold === 0) {
          throw new ConditionCompilerError(
            "ALREADY_DECIDED",
            "Total goals at least 0 is always true.",
          );
        }
        return { kind: "totalGoals", comparison, threshold };
      }
    case "bothTeamsScore":
      assertExactKeys(value, ["kind"], context);
      return { kind: "bothTeamsScore" };
    case "winningMargin":
      assertExactKeys(value, ["kind", "participant", "threshold"], context);
      return {
        kind: "winningMargin",
        participant: parseParticipant(
          value.participant,
          `${context}.participant`,
        ),
        threshold: parseThreshold(
          value.threshold,
          1,
          CONDITION_LIMITS.maxWinningMargin,
          `${context}.threshold`,
        ),
      };
    case "totalCorners":
      assertExactKeys(value, ["kind", "comparison", "threshold"], context);
      {
        const comparison = parseComparison(
          value.comparison,
          `${context}.comparison`,
        );
        const threshold = parseThreshold(
          value.threshold,
          0,
          CONDITION_LIMITS.maxCornerThreshold,
          `${context}.threshold`,
        );
        if (comparison === "atLeast" && threshold === 0) {
          throw new ConditionCompilerError(
            "ALREADY_DECIDED",
            "Total corners at least 0 is always true.",
          );
        }
        return { kind: "totalCorners", comparison, threshold };
      }
    default:
      throw new ConditionCompilerError(
        "UNSUPPORTED_CONDITION",
        `${context}.kind “${value.kind}” is not supported by compiler version 1.`,
      );
  }
}

function compareLegs(left: ConditionLegV1, right: ConditionLegV1): number {
  const kindDifference =
    LEG_KIND_ORDER.indexOf(left.kind) - LEG_KIND_ORDER.indexOf(right.kind);
  if (kindDifference !== 0) return kindDifference;

  const leftCanonical = canonicalizeJson(left as JsonValue);
  const rightCanonical = canonicalizeJson(right as JsonValue);
  return leftCanonical < rightCanonical
    ? -1
    : leftCanonical > rightCanonical
      ? 1
      : 0;
}

function minimumGoalsForLeg(leg: ConditionLegV1): number | null {
  switch (leg.kind) {
    case "participantWins":
      return 1;
    case "winningMargin":
      return leg.threshold;
    case "bothTeamsScore":
      return 2;
    case "totalGoals":
      return leg.comparison === "atLeast" ? leg.threshold : null;
    case "totalCorners":
      return null;
  }
}

function validatePair(left: ConditionLegV1, right: ConditionLegV1): void {
  const fail = (reason: string): never => {
    throw new ConditionCompilerError(
      "CONTRADICTORY_LEGS",
      `The condition legs cannot both be true: ${reason}.`,
    );
  };

  if (
    left.kind === "participantWins" &&
    right.kind === "participantWins" &&
    left.participant !== right.participant
  ) {
    fail("both participants cannot win");
  }

  const leftWinner =
    left.kind === "participantWins" || left.kind === "winningMargin"
      ? left.participant
      : null;
  const rightWinner =
    right.kind === "participantWins" || right.kind === "winningMargin"
      ? right.participant
      : null;
  if (
    leftWinner !== null &&
    rightWinner !== null &&
    leftWinner !== rightWinner
  ) {
    fail("the legs require different winners");
  }

  if (
    left.kind === right.kind &&
    (left.kind === "totalGoals" || left.kind === "totalCorners")
  ) {
    const leftThreshold = left.threshold;
    const rightThreshold = (right as typeof left).threshold;
    const lower =
      left.comparison === "atLeast"
        ? leftThreshold
        : (right as typeof left).comparison === "atLeast"
          ? rightThreshold
          : null;
    const upper =
      left.comparison === "atMost"
        ? leftThreshold
        : (right as typeof left).comparison === "atMost"
          ? rightThreshold
          : null;

    if (lower !== null && upper !== null && lower > upper) {
      fail(`${left.kind} minimum ${lower} exceeds maximum ${upper}`);
    }
  }

  const goalMaximum =
    left.kind === "totalGoals" && left.comparison === "atMost"
      ? left.threshold
      : right.kind === "totalGoals" && right.comparison === "atMost"
        ? right.threshold
        : null;
  if (goalMaximum !== null) {
    const other = left.kind === "totalGoals" ? right : left;
    const requiredMinimum = minimumGoalsForLeg(other);
    if (requiredMinimum !== null && requiredMinimum > goalMaximum) {
      fail(
        `${other.kind} requires at least ${requiredMinimum} goals but totalGoals allows at most ${goalMaximum}`,
      );
    }
  }
}

export function normalizeCondition(input: unknown): CanonicalConditionV1 {
  if (!isRecord(input)) {
    throw new ConditionCompilerError(
      "INVALID_SCHEMA",
      "A condition must be an object.",
    );
  }

  assertExactKeys(
    input,
    ["version", "fixtureId", "operator", "legs"],
    "condition",
  );

  if (input.version !== CONDITION_SCHEMA_VERSION) {
    throw new ConditionCompilerError(
      "UNSUPPORTED_VERSION",
      `Condition schema version ${String(input.version)} is not supported.`,
    );
  }

  if (
    typeof input.fixtureId !== "string" ||
    !/^[1-9]\d*$/.test(input.fixtureId) ||
    BigInt(input.fixtureId) > MAX_SIGNED_I64
  ) {
    throw new ConditionCompilerError(
      "INVALID_FIXTURE_ID",
      "fixtureId must be a positive signed-64-bit base-10 integer string without leading zeros.",
    );
  }

  if (input.operator !== "all") {
    throw new ConditionCompilerError(
      "INVALID_SCHEMA",
      'Compiler version 1 only supports operator "all".',
    );
  }

  if (
    !Array.isArray(input.legs) ||
    input.legs.length < 1 ||
    input.legs.length > CONDITION_LIMITS.maxLegs
  ) {
    throw new ConditionCompilerError(
      "INVALID_LEG_COUNT",
      `A condition must contain 1 through ${CONDITION_LIMITS.maxLegs} legs.`,
    );
  }

  const legs = input.legs.map(parseLeg).sort(compareLegs);
  const legKeys = legs.map((leg) => canonicalizeJson(leg as JsonValue));
  if (new Set(legKeys).size !== legKeys.length) {
    throw new ConditionCompilerError(
      "DUPLICATE_LEG",
      "A condition cannot contain the same leg more than once.",
    );
  }

  if (legs.length === 2) validatePair(legs[0]!, legs[1]!);

  return {
    version: CONDITION_SCHEMA_VERSION,
    fixtureId: input.fixtureId,
    operator: "all",
    legs,
  };
}
