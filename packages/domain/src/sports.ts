export const SPORTS_DATA_SCHEMA_VERSION = 1 as const;

export type FixtureId = string;

export type MatchLifecycle =
  | "scheduled"
  | "live"
  | "paused"
  | "finalizing"
  | "finalized"
  | "unavailable"
  | "unknown";

export type MatchParticipant = {
  position: 1 | 2;
  id: string;
  name: string;
  designation: "home" | "away";
};

export type MatchFixture = {
  schemaVersion: typeof SPORTS_DATA_SCHEMA_VERSION;
  source: "txline";
  fixtureId: FixtureId;
  competition: {
    id: string;
    name: string;
  };
  fixtureGroupId: string;
  startsAt: string;
  sourceUpdatedAt: string;
  lifecycle: "scheduled" | "unavailable" | "unknown";
  participants: [MatchParticipant, MatchParticipant];
};

export type OddsOutcome = {
  key: string;
  rawPrice: number | null;
  probabilityPercent: number | null;
};

export type MatchOddsMarket = {
  schemaVersion: typeof SPORTS_DATA_SCHEMA_VERSION;
  source: "txline";
  fixtureId: FixtureId;
  messageId: string;
  sourceUpdatedAt: string;
  bookmaker: {
    id: string;
    name: string;
  };
  marketType: string;
  marketPeriod: string | null;
  marketParameters: string | null;
  gameState: string | null;
  inRunning: boolean;
  outcomes: OddsOutcome[];
};

export type ParticipantScore = {
  goals: number | null;
  yellowCards: number | null;
  redCards: number | null;
  corners: number | null;
};

export type ScoreAmendment = {
  targetAction: string | null;
  previous: Record<string, string | number | boolean | null> | null;
  next: Record<string, string | number | boolean | null> | null;
};

export type MatchScoreRecord = {
  schemaVersion: typeof SPORTS_DATA_SCHEMA_VERSION;
  source: "txline";
  fixtureId: FixtureId;
  sequence: number;
  sourceUpdatedAt: string;
  startsAt: string | null;
  action: string;
  gameState: string | null;
  lifecycle: MatchLifecycle;
  statusId: number | null;
  period: number | null;
  participant: 1 | 2 | null;
  participant1IsHome: boolean | null;
  clock: {
    running: boolean | null;
    seconds: number | null;
  } | null;
  score: {
    participant1: ParticipantScore;
    participant2: ParticipantScore;
  };
  stats: Record<string, number>;
  amendment: ScoreAmendment | null;
  isFinal: boolean;
};
