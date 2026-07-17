import type {
  CanonicalConditionV1,
  ConditionLegV1,
  ParticipantPosition,
} from "@proof-play/domain";

import { canonicalizeJson, type JsonValue } from "./canonical";
import { ConditionCompilerError } from "./errors";
import {
  CONDITION_COMPILER_VERSION,
  CONDITION_LIMITS,
  normalizeCondition,
} from "./schema";

export const TXLINE_STAT_KEYS = {
  participant1Goals: 1,
  participant2Goals: 2,
  participant1Corners: 7,
  participant2Corners: 8,
} as const;

type AnchorEnumVariant<Name extends string> = Record<
  Name,
  Record<string, never>
>;

export type TxlineComparison =
  | AnchorEnumVariant<"greaterThan">
  | AnchorEnumVariant<"lessThan">
  | AnchorEnumVariant<"equalTo">;

export type TxlineBinaryExpression =
  AnchorEnumVariant<"add"> | AnchorEnumVariant<"subtract">;

export type TxlineTraderPredicate = {
  threshold: number;
  comparison: TxlineComparison;
};

export type TxlineStatPredicate =
  | {
      single: {
        index: number;
        predicate: TxlineTraderPredicate;
      };
    }
  | {
      binary: {
        indexA: number;
        indexB: number;
        op: TxlineBinaryExpression;
        predicate: TxlineTraderPredicate;
      };
    };

export type TxlineValidationStrategy = {
  geometricTargets: [];
  distancePredicate: null;
  discretePredicates: TxlineStatPredicate[];
};

export type ConditionDisplayOptions = {
  participantNames?: Partial<Record<ParticipantPosition, string>>;
};

export type CompiledConditionLegV1 = {
  leg: ConditionLegV1;
  humanStatement: string;
  statKeys: number[];
  predicateIndexes: number[];
};

export type CompiledConditionV1 = {
  compilerVersion: typeof CONDITION_COMPILER_VERSION;
  validationMethod: "validateStatV3";
  fixtureId: string;
  condition: CanonicalConditionV1;
  humanStatement: string;
  canonicalJson: string;
  conditionCommitment: Uint8Array;
  conditionCommitmentHex: string;
  statKeys: number[];
  strategy: TxlineValidationStrategy;
  compiledLegs: CompiledConditionLegV1[];
};

function participantName(
  participant: ParticipantPosition,
  options: ConditionDisplayOptions,
): string {
  const candidate = options.participantNames?.[participant]?.trim();
  return candidate ? candidate : `Participant ${participant}`;
}

function pluralize(value: number, singular: string): string {
  return value === 1 ? singular : `${singular}s`;
}

export function renderConditionLeg(
  leg: ConditionLegV1,
  options: ConditionDisplayOptions = {},
): string {
  switch (leg.kind) {
    case "participantWins":
      return `${participantName(leg.participant, options)} wins`;
    case "totalGoals":
      return `total goals are ${leg.comparison === "atLeast" ? "at least" : "at most"} ${leg.threshold}`;
    case "bothTeamsScore":
      return "both teams score";
    case "winningMargin":
      return `${participantName(leg.participant, options)} wins by at least ${leg.threshold} ${pluralize(leg.threshold, "goal")}`;
    case "totalCorners":
      return `total corners are ${leg.comparison === "atLeast" ? "at least" : "at most"} ${leg.threshold}`;
  }
}

function capitalizeFirst(value: string): string {
  return value.length === 0 ? value : value[0]!.toUpperCase() + value.slice(1);
}

export function renderCondition(
  condition: CanonicalConditionV1,
  options: ConditionDisplayOptions = {},
): string {
  return `${capitalizeFirst(
    condition.legs.map((leg) => renderConditionLeg(leg, options)).join(" and "),
  )}.`;
}

function requiredStatKeys(leg: ConditionLegV1): number[] {
  switch (leg.kind) {
    case "participantWins":
    case "totalGoals":
    case "bothTeamsScore":
    case "winningMargin":
      return [
        TXLINE_STAT_KEYS.participant1Goals,
        TXLINE_STAT_KEYS.participant2Goals,
      ];
    case "totalCorners":
      return [
        TXLINE_STAT_KEYS.participant1Corners,
        TXLINE_STAT_KEYS.participant2Corners,
      ];
  }
}

function greaterThan(threshold: number): TxlineTraderPredicate {
  return { threshold, comparison: { greaterThan: {} } };
}

function lessThan(threshold: number): TxlineTraderPredicate {
  return { threshold, comparison: { lessThan: {} } };
}

function compileLeg(
  leg: ConditionLegV1,
  indexByStatKey: ReadonlyMap<number, number>,
): TxlineStatPredicate[] {
  const index = (statKey: number): number => {
    const resolved = indexByStatKey.get(statKey);
    if (resolved === undefined) {
      throw new ConditionCompilerError(
        "STRATEGY_INVARIANT",
        `Strategy index for TxLINE stat key ${statKey} is missing.`,
      );
    }
    return resolved;
  };

  const goalIndexes = (): [number, number] => [
    index(TXLINE_STAT_KEYS.participant1Goals),
    index(TXLINE_STAT_KEYS.participant2Goals),
  ];

  switch (leg.kind) {
    case "participantWins": {
      const [goals1, goals2] = goalIndexes();
      const selected = leg.participant === 1 ? goals1 : goals2;
      const opponent = leg.participant === 1 ? goals2 : goals1;
      return [
        {
          binary: {
            indexA: selected,
            indexB: opponent,
            op: { subtract: {} },
            predicate: greaterThan(0),
          },
        },
      ];
    }
    case "totalGoals": {
      const [goals1, goals2] = goalIndexes();
      return [
        {
          binary: {
            indexA: goals1,
            indexB: goals2,
            op: { add: {} },
            predicate:
              leg.comparison === "atLeast"
                ? greaterThan(leg.threshold - 1)
                : lessThan(leg.threshold + 1),
          },
        },
      ];
    }
    case "bothTeamsScore": {
      const [goals1, goals2] = goalIndexes();
      return [
        { single: { index: goals1, predicate: greaterThan(0) } },
        { single: { index: goals2, predicate: greaterThan(0) } },
      ];
    }
    case "winningMargin": {
      const [goals1, goals2] = goalIndexes();
      const selected = leg.participant === 1 ? goals1 : goals2;
      const opponent = leg.participant === 1 ? goals2 : goals1;
      return [
        {
          binary: {
            indexA: selected,
            indexB: opponent,
            op: { subtract: {} },
            predicate: greaterThan(leg.threshold - 1),
          },
        },
      ];
    }
    case "totalCorners": {
      const corners1 = index(TXLINE_STAT_KEYS.participant1Corners);
      const corners2 = index(TXLINE_STAT_KEYS.participant2Corners);
      return [
        {
          binary: {
            indexA: corners1,
            indexB: corners2,
            op: { add: {} },
            predicate:
              leg.comparison === "atLeast"
                ? greaterThan(leg.threshold - 1)
                : lessThan(leg.threshold + 1),
          },
        },
      ];
    }
  }
}

function predicateIndexes(predicate: TxlineStatPredicate): number[] {
  if ("single" in predicate) return [predicate.single.index];
  return [predicate.binary.indexA, predicate.binary.indexB];
}

function assertStrategyInvariants(
  statKeys: readonly number[],
  strategy: TxlineValidationStrategy,
): void {
  if (
    statKeys.length === 0 ||
    statKeys.length > CONDITION_LIMITS.maxUniqueStatKeys ||
    new Set(statKeys).size !== statKeys.length
  ) {
    throw new ConditionCompilerError(
      "STAT_LIMIT_EXCEEDED",
      `A compiled condition must request 1 through ${CONDITION_LIMITS.maxUniqueStatKeys} unique TxLINE stat keys.`,
    );
  }

  const referenceCounts = new Map<number, number>();
  for (const predicate of strategy.discretePredicates) {
    for (const index of predicateIndexes(predicate)) {
      if (!Number.isInteger(index) || index < 0 || index >= statKeys.length) {
        throw new ConditionCompilerError(
          "STRATEGY_INVARIANT",
          `Predicate index ${index} is outside the statKeys array.`,
        );
      }
      referenceCounts.set(index, (referenceCounts.get(index) ?? 0) + 1);
    }
  }

  if (
    referenceCounts.size !== statKeys.length ||
    statKeys.some((_, index) => referenceCounts.get(index) !== 1)
  ) {
    throw new ConditionCompilerError(
      "STRATEGY_INVARIANT",
      "Every requested TxLINE stat must be referenced exactly once by the validation strategy.",
    );
  }
}

async function sha256(value: string): Promise<Uint8Array> {
  if (!globalThis.crypto?.subtle) {
    throw new ConditionCompilerError(
      "HASH_UNAVAILABLE",
      "Web Crypto SHA-256 is unavailable in this runtime.",
    );
  }

  return new Uint8Array(
    await globalThis.crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(value),
    ),
  );
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

export async function compileCondition(
  input: unknown,
  displayOptions: ConditionDisplayOptions = {},
): Promise<CompiledConditionV1> {
  const condition = normalizeCondition(input);
  const requestedStatKeys = condition.legs.flatMap(requiredStatKeys);
  const statKeys = Array.from(new Set(requestedStatKeys)).sort(
    (left, right) => left - right,
  );
  if (statKeys.length !== requestedStatKeys.length) {
    throw new ConditionCompilerError(
      "DUPLICATE_STAT_COVERAGE",
      "TxLINE validateStatV3 requires every stat index to be evaluated exactly once; choose condition legs that use disjoint stat keys.",
    );
  }
  const indexByStatKey = new Map(
    statKeys.map((statKey, index) => [statKey, index] as const),
  );
  const discretePredicates: TxlineStatPredicate[] = [];
  const compiledLegs = condition.legs.map((leg) => {
    const predicates = compileLeg(leg, indexByStatKey);
    const firstPredicateIndex = discretePredicates.length;
    discretePredicates.push(...predicates);

    return {
      leg,
      humanStatement: `${capitalizeFirst(renderConditionLeg(leg, displayOptions))}.`,
      statKeys: requiredStatKeys(leg),
      predicateIndexes: predicates.map(
        (_, offset) => firstPredicateIndex + offset,
      ),
    };
  });
  const strategy: TxlineValidationStrategy = {
    geometricTargets: [],
    distancePredicate: null,
    discretePredicates,
  };
  assertStrategyInvariants(statKeys, strategy);

  const canonicalJson = canonicalizeJson(condition as unknown as JsonValue);
  const conditionCommitment = await sha256(canonicalJson);

  return {
    compilerVersion: CONDITION_COMPILER_VERSION,
    validationMethod: "validateStatV3",
    fixtureId: condition.fixtureId,
    condition,
    humanStatement: renderCondition(condition, displayOptions),
    canonicalJson,
    conditionCommitment,
    conditionCommitmentHex: bytesToHex(conditionCommitment),
    statKeys,
    strategy,
    compiledLegs,
  };
}
