export type PoolSide = "yes" | "no";

export type PoolLifecycleState =
  "open" | "locked" | "settledYes" | "settledNo" | "cancelled" | "closed";

export type SettlementSourceState =
  | "awaitingFinalRecord"
  | "fetchingProof"
  | "readyToSubmit"
  | "submitting"
  | "confirmed"
  | "retryableFailure"
  | "terminalFailure";
