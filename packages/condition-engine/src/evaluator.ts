import type { ConditionLegV1 } from "@proof-play/domain";

import type {
  CompiledConditionV1,
  TxlineComparison,
  TxlineStatPredicate,
} from "./compiler";
import { ConditionCompilerError } from "./errors";

export type ConditionLegEvaluation = {
  leg: ConditionLegV1;
  humanStatement: string;
  outcome: boolean | null;
  statValues: Record<string, number>;
};

export type ConditionEvaluation = {
  status: "resolved" | "missingStats";
  outcome: boolean | null;
  missingStatKeys: number[];
  statValues: Record<string, number>;
  legs: ConditionLegEvaluation[];
};

function compare(
  value: number,
  threshold: number,
  comparison: TxlineComparison,
): boolean {
  if ("greaterThan" in comparison) return value > threshold;
  if ("lessThan" in comparison) return value < threshold;
  return value === threshold;
}

function evaluatePredicate(
  predicate: TxlineStatPredicate,
  values: readonly number[],
): boolean {
  if ("single" in predicate) {
    return compare(
      values[predicate.single.index]!,
      predicate.single.predicate.threshold,
      predicate.single.predicate.comparison,
    );
  }

  const left = values[predicate.binary.indexA]!;
  const right = values[predicate.binary.indexB]!;
  const calculated = "add" in predicate.binary.op ? left + right : left - right;
  return compare(
    calculated,
    predicate.binary.predicate.threshold,
    predicate.binary.predicate.comparison,
  );
}

export function evaluateCondition(
  compiled: CompiledConditionV1,
  stats: Readonly<Record<string, number | undefined>>,
): ConditionEvaluation {
  const statValues: Record<string, number> = {};
  const missingStatKeys: number[] = [];

  for (const statKey of compiled.statKeys) {
    const value = stats[String(statKey)];
    if (value === undefined) {
      missingStatKeys.push(statKey);
      continue;
    }
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new ConditionCompilerError(
        "INVALID_STATS",
        `TxLINE stat ${statKey} must be a non-negative safe integer.`,
      );
    }
    statValues[String(statKey)] = value;
  }

  if (missingStatKeys.length > 0) {
    return {
      status: "missingStats",
      outcome: null,
      missingStatKeys,
      statValues,
      legs: compiled.compiledLegs.map((compiledLeg) => ({
        leg: compiledLeg.leg,
        humanStatement: compiledLeg.humanStatement,
        outcome: null,
        statValues: Object.fromEntries(
          compiledLeg.statKeys
            .filter((statKey) => String(statKey) in statValues)
            .map((statKey) => [String(statKey), statValues[String(statKey)]!]),
        ),
      })),
    };
  }

  const orderedValues = compiled.statKeys.map(
    (statKey) => statValues[String(statKey)]!,
  );
  const predicateResults = compiled.strategy.discretePredicates.map(
    (predicate) => evaluatePredicate(predicate, orderedValues),
  );
  const legs = compiled.compiledLegs.map((compiledLeg) => ({
    leg: compiledLeg.leg,
    humanStatement: compiledLeg.humanStatement,
    outcome: compiledLeg.predicateIndexes.every(
      (predicateIndex) => predicateResults[predicateIndex],
    ),
    statValues: Object.fromEntries(
      compiledLeg.statKeys.map((statKey) => [
        String(statKey),
        statValues[String(statKey)]!,
      ]),
    ),
  }));

  return {
    status: "resolved",
    outcome: legs.every((leg) => leg.outcome),
    missingStatKeys: [],
    statValues,
    legs,
  };
}
