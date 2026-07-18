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

export type TxlineProofNodeBytes = {
  hash: number[];
  isRightSibling: boolean;
};

/**
 * Compact multiproof payload accepted by TxLINE's validateStatV3 instruction.
 * The observed sequence is API-selection metadata: TxLINE commits the selected
 * event through eventStatRoot, but the V3 on-chain argument has no sequence
 * field of its own.
 */
export type TxlineScoreProofV3 = {
  fixtureId: string;
  sequence: number;
  requestedStatKeys: number[];
  sourceUpdatedAt: string;
  payload: {
    ts: number;
    fixtureSummary: {
      fixtureId: string;
      updateStats: {
        updateCount: number;
        minTimestamp: number;
        maxTimestamp: number;
      };
      eventsSubTreeRoot: number[];
    };
    fixtureProof: TxlineProofNodeBytes[];
    mainTreeProof: TxlineProofNodeBytes[];
    eventStatRoot: number[];
    leaves: Array<{
      stat: TxlineProvenStat;
      statProof: TxlineProofNodeBytes[];
    }>;
    multiproofHashes: TxlineProofNodeBytes[];
    leafIndices: number[];
  };
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
  getScoreProofV3(input: {
    fixtureId: string;
    sequence: number;
    statKeys: number[];
  }): Promise<TxlineScoreProofV3>;
};
