import type { MatchScoreRecord } from "@proof-play/domain";
import type { TxlineScoreProofV3 } from "@proof-play/txline";
import {
  SettlementKeeper,
  type KeeperDependencies,
  type KeeperLogEvent,
  type KeeperPool,
} from "../scripts/keeper/src/core";
import { describe, expect, it, vi } from "vitest";

const pool: KeeperPool = {
  poolAddress: "3fCNRpakrJdsoaG46xFuHqMUK2YZM9FyvwuJediB5PhD",
  fixtureId: "18241006",
  state: "locked",
  statKeys: [1, 2, 7, 8],
  strategy: { all: [] },
};

const finalRecord: MatchScoreRecord = {
  schemaVersion: 1,
  source: "txline",
  fixtureId: pool.fixtureId,
  sequence: 962,
  sourceUpdatedAt: "2026-07-15T23:54:24.772Z",
  startsAt: "2026-07-15T21:00:00.000Z",
  action: "game_finalised",
  gameState: "finished",
  lifecycle: "finalized",
  statusId: 100,
  period: null,
  participant: null,
  participant1IsHome: true,
  clock: null,
  score: {
    participant1: { goals: 1, yellowCards: 0, redCards: 0, corners: 1 },
    participant2: { goals: 2, yellowCards: 0, redCards: 0, corners: 6 },
  },
  stats: { "1": 1, "2": 2, "7": 1, "8": 6 },
  amendment: null,
  isFinal: true,
};

const proof: TxlineScoreProofV3 = {
  fixtureId: pool.fixtureId,
  sequence: finalRecord.sequence,
  requestedStatKeys: pool.statKeys,
  sourceUpdatedAt: finalRecord.sourceUpdatedAt,
  payload: {
    ts: 1_784_150_064_772,
    fixtureSummary: {
      fixtureId: pool.fixtureId,
      updateStats: {
        updateCount: 962,
        minTimestamp: 1,
        maxTimestamp: 2,
      },
      eventsSubTreeRoot: [1],
    },
    fixtureProof: [],
    mainTreeProof: [],
    eventStatRoot: [2],
    leaves: [1, 2, 7, 8].map((key) => ({
      stat: { key, value: finalRecord.stats[String(key)]!, period: 100 },
      statProof: [],
    })),
    multiproofHashes: [],
    leafIndices: [32, 33, 36, 37],
  },
};

function dependencies(
  overrides: Partial<KeeperDependencies> = {},
): KeeperDependencies {
  return {
    listPools: vi.fn(async () => [pool]),
    loadPool: vi.fn(async () => pool),
    getHistoricalScores: vi.fn(async () => [finalRecord]),
    getScoreProof: vi.fn(async () => proof),
    submitSettlement: vi.fn(async () => ({
      transactionSignature: "tx-signature",
    })),
    sleep: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe("permissionless settlement keeper", () => {
  it("settles only from an exact finalized TxLINE record and V3 proof", async () => {
    const deps = dependencies();
    const events: KeeperLogEvent[] = [];
    const result = await new SettlementKeeper(deps, (event) =>
      events.push(event),
    ).run();
    expect(result).toEqual([
      {
        poolAddress: pool.poolAddress,
        fixtureId: pool.fixtureId,
        status: "settled",
        sequence: 962,
        transactionSignature: "tx-signature",
      },
    ]);
    expect(deps.getScoreProof).toHaveBeenCalledWith({
      fixtureId: pool.fixtureId,
      sequence: 962,
      statKeys: pool.statKeys,
    });
    expect(events.at(-1)).toMatchObject({
      event: "keeper.settlement-confirmed",
      state: "confirmed",
      transactionSignature: "tx-signature",
    });
  });

  it("retries transient proof failures with visible structured state", async () => {
    const unavailable = Object.assign(new Error("upstream 503"), {
      status: 503,
    });
    const getScoreProof = vi
      .fn<KeeperDependencies["getScoreProof"]>()
      .mockRejectedValueOnce(unavailable)
      .mockResolvedValueOnce(proof);
    const deps = dependencies({ getScoreProof });
    const events: KeeperLogEvent[] = [];
    const result = await new SettlementKeeper(deps, (event) =>
      events.push(event),
    ).run({
      maxAttempts: 2,
      retryBaseDelayMs: 1,
    });
    expect(result[0]!.status).toBe("settled");
    expect(getScoreProof).toHaveBeenCalledTimes(2);
    expect(events).toContainEqual(
      expect.objectContaining({
        event: "keeper.proof-fetch-failed",
        state: "retryableFailure",
        attempt: 1,
      }),
    );
    expect(deps.sleep).toHaveBeenCalledWith(1);
  });

  it("is idempotent when a pool was already resolved or changed before submit", async () => {
    const closed = { ...pool, state: "closed" as const, statKeys: [] };
    const settledDeps = dependencies({
      listPools: vi.fn(async () => [closed]),
    });
    const settledResult = await new SettlementKeeper(
      settledDeps,
      vi.fn(),
    ).run();
    expect(settledResult[0]!.status).toBe("alreadySettled");
    expect(settledDeps.getHistoricalScores).not.toHaveBeenCalled();

    const racedDeps = dependencies({ loadPool: vi.fn(async () => closed) });
    const racedResult = await new SettlementKeeper(racedDeps, vi.fn()).run();
    expect(racedResult[0]).toMatchObject({
      status: "alreadySettled",
      sequence: 962,
    });
    expect(racedDeps.submitSettlement).not.toHaveBeenCalled();
  });

  it("reports pending finality and terminal proof mismatches without submitting", async () => {
    const pendingDeps = dependencies({
      getHistoricalScores: vi.fn(async () => [
        { ...finalRecord, isFinal: false, action: "game_finished" },
      ]),
    });
    const pending = await new SettlementKeeper(pendingDeps, vi.fn()).run();
    expect(pending[0]!.status).toBe("awaitingFinalRecord");

    const mismatchDeps = dependencies({
      getScoreProof: vi.fn(async () => ({ ...proof, sequence: 961 })),
    });
    const mismatch = await new SettlementKeeper(mismatchDeps, vi.fn()).run();
    expect(mismatch[0]).toMatchObject({
      status: "terminalFailure",
      code: "KEEPER_PROOF_MISMATCH",
    });
    expect(mismatchDeps.submitSettlement).not.toHaveBeenCalled();
  });
});
