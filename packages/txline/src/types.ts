import type {
  MatchFixture,
  MatchOddsMarket,
  MatchScoreRecord,
} from "@proof-play/domain";

export type TxlineHash = number[] | string;

export type TxlineProofNode = {
  hash: TxlineHash;
  isRightSibling: boolean;
};

export type TxlineProvenStat = {
  key: number;
  value: number;
  period: number;
};

export type TxlineScoreProof = {
  fixtureId: string;
  sequence: number;
  requestedStatKeys: number[];
  sourceUpdatedAt: string;
  stats: TxlineProvenStat[];
  eventStatRoot: TxlineHash;
  summary: {
    fixtureId: string;
    updateCount: number;
    minTimestamp: number;
    maxTimestamp: number;
    eventStatsSubTreeRoot: TxlineHash;
  };
  statProofs: TxlineProofNode[][];
  subTreeProof: TxlineProofNode[];
  mainTreeProof: TxlineProofNode[];
};

export type FixtureQuery = {
  competitionId?: number;
  startEpochDay?: number;
};

export type TxlineAdapterContract = {
  listFixtures(query?: FixtureQuery): Promise<MatchFixture[]>;
  getFixture(fixtureId: string, query?: FixtureQuery): Promise<MatchFixture>;
  getOddsSnapshot(
    fixtureId: string,
    options?: { asOf?: number },
  ): Promise<MatchOddsMarket[]>;
  getScoreSnapshot(
    fixtureId: string,
    options?: { asOf?: number },
  ): Promise<MatchScoreRecord[]>;
  getScoreUpdates(fixtureId: string): Promise<MatchScoreRecord[]>;
  getHistoricalScores(fixtureId: string): Promise<MatchScoreRecord[]>;
  getScoreProof(input: {
    fixtureId: string;
    sequence: number;
    statKeys: number[];
  }): Promise<TxlineScoreProof>;
};
