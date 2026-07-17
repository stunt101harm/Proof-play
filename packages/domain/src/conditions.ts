import type { FixtureId } from "./sports";

export const CONDITION_SCHEMA_VERSION = 1 as const;

export type ParticipantPosition = 1 | 2;
export type ThresholdComparison = "atLeast" | "atMost";

export type ParticipantWinsLeg = {
  kind: "participantWins";
  participant: ParticipantPosition;
};

export type TotalGoalsLeg = {
  kind: "totalGoals";
  comparison: ThresholdComparison;
  threshold: number;
};

export type BothTeamsScoreLeg = {
  kind: "bothTeamsScore";
};

export type WinningMarginLeg = {
  kind: "winningMargin";
  participant: ParticipantPosition;
  threshold: number;
};

export type TotalCornersLeg = {
  kind: "totalCorners";
  comparison: ThresholdComparison;
  threshold: number;
};

export type ConditionLegV1 =
  | ParticipantWinsLeg
  | TotalGoalsLeg
  | BothTeamsScoreLeg
  | WinningMarginLeg
  | TotalCornersLeg;

export type CanonicalConditionV1 = {
  version: typeof CONDITION_SCHEMA_VERSION;
  fixtureId: FixtureId;
  operator: "all";
  legs: ConditionLegV1[];
};
