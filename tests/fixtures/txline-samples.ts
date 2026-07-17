export const RAW_FIXTURE = {
  Ts: 1_781_920_800_000,
  StartTime: 1_781_830_800_000,
  Competition: "World Cup",
  CompetitionId: 72,
  FixtureGroupId: 10_115_674,
  Participant1Id: 2_545,
  Participant1: "Participant A",
  Participant2Id: 3_013,
  Participant2: "Participant B",
  FixtureId: 17_588_223,
  Participant1IsHome: true,
};

export const RAW_ODDS = {
  FixtureId: 17_588_223,
  MessageId: "sample-message",
  Ts: 1_781_830_799_059,
  Bookmaker: "TXLineStablePriceDemargined",
  BookmakerId: 10_021,
  SuperOddsType: "1X2_PARTICIPANT_RESULT",
  GameState: null,
  InRunning: false,
  MarketParameters: null,
  MarketPeriod: "half=1",
  PriceNames: ["part1", "draw", "part2"],
  Prices: [2_926, 2_155, 5_150],
  Pct: ["34.176", "NA", "19.417"],
};

export function rawScore(
  sequence: number,
  overrides: Record<string, unknown> = {},
) {
  return {
    FixtureId: 42,
    GameState: "scheduled",
    StartTime: 1_784_142_000_000,
    Participant1IsHome: true,
    Action: "status",
    Ts: 1_784_150_000_000 + sequence,
    Seq: sequence,
    StatusId: 2,
    Participant: 1,
    Clock: { Running: true, Seconds: 60 },
    Stats: { "8": 6, "1": 1, "7": 1, "2": 2, "3": 1, "4": 3 },
    ...overrides,
  };
}

const hash = (value: number) => Array.from({ length: 32 }, () => value);

export const RAW_SCORE_PROOF = {
  ts: 1_784_150_592_580,
  statsToProve: [{ key: 1, value: 1, period: 0 }],
  eventStatRoot: hash(1),
  summary: {
    fixtureId: 42,
    updateStats: {
      updateCount: 1,
      minTimestamp: 1_784_150_592_580,
      maxTimestamp: 1_784_150_592_580,
    },
    eventStatsSubTreeRoot: hash(2),
  },
  statProofs: [[{ hash: hash(3), isRightSibling: true }]],
  subTreeProof: [{ hash: hash(4), isRightSibling: false }],
  mainTreeProof: [{ hash: hash(5), isRightSibling: false }],
};
