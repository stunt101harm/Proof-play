export type ConditionCompilerErrorCode =
  | "INVALID_SCHEMA"
  | "UNSUPPORTED_VERSION"
  | "INVALID_FIXTURE_ID"
  | "INVALID_LEG_COUNT"
  | "UNSUPPORTED_CONDITION"
  | "DUPLICATE_LEG"
  | "DUPLICATE_STAT_COVERAGE"
  | "CONTRADICTORY_LEGS"
  | "ALREADY_DECIDED"
  | "STAT_LIMIT_EXCEEDED"
  | "STRATEGY_INVARIANT"
  | "HASH_UNAVAILABLE"
  | "INVALID_STATS";

export class ConditionCompilerError extends Error {
  readonly code: ConditionCompilerErrorCode;

  constructor(code: ConditionCompilerErrorCode, message: string) {
    super(message);
    this.name = "ConditionCompilerError";
    this.code = code;
  }
}
