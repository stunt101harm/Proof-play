import type { MatchScoreRecord } from "@proof-play/domain";
import {
  createReplaySchedule,
  initialReplayState,
  prepareReplayRecords,
  reduceReplayRecord,
  replayScoreRecords,
  setReplayStatus,
} from "@proof-play/replay";
import { describe, expect, it, vi } from "vitest";

function scoreRecord(
  sequence: number,
  input: Partial<MatchScoreRecord> = {},
): MatchScoreRecord {
  return {
    schemaVersion: 1,
    source: "txline",
    fixtureId: "18241006",
    sequence,
    sourceUpdatedAt: new Date(
      Date.parse("2026-07-15T18:00:00.000Z") + sequence * 1_000,
    ).toISOString(),
    startsAt: "2026-07-15T18:00:00.000Z",
    action: "clock_updated",
    gameState: "in_play",
    lifecycle: "live",
    statusId: 20,
    period: 1,
    participant: null,
    participant1IsHome: true,
    clock: { running: true, seconds: sequence },
    score: {
      participant1: {
        goals: 0,
        yellowCards: 0,
        redCards: 0,
        corners: 0,
      },
      participant2: {
        goals: 0,
        yellowCards: 0,
        redCards: 0,
        corners: 0,
      },
    },
    stats: {},
    amendment: null,
    isFinal: false,
    ...input,
  };
}

describe("deterministic match replay", () => {
  it("sorts one fixture by observed sequence and rejects duplicate events", () => {
    expect(
      prepareReplayRecords([
        scoreRecord(3),
        scoreRecord(1),
        scoreRecord(2),
      ]).map((record) => record.sequence),
    ).toEqual([1, 2, 3]);
    expect(() =>
      prepareReplayRecords([scoreRecord(1), scoreRecord(1)]),
    ).toThrow(/duplicate sequence 1/i);
    expect(() =>
      prepareReplayRecords([
        scoreRecord(1),
        scoreRecord(2, { fixtureId: "999" }),
      ]),
    ).toThrow(/does not match/i);
  });

  it("compresses source time deterministically into the judge-demo window", () => {
    const records = [
      scoreRecord(1),
      scoreRecord(2, { sourceUpdatedAt: "2026-07-15T18:00:01.000Z" }),
      scoreRecord(3, { sourceUpdatedAt: "2026-07-15T20:00:00.000Z" }),
      scoreRecord(4, { sourceUpdatedAt: "2026-07-15T20:00:02.000Z" }),
    ];
    const first = createReplaySchedule(records, 75_000);
    const second = createReplaySchedule(records, 75_000);
    expect(first).toEqual(second);
    expect(first.reduce((sum, item) => sum + item.delayMs, 0)).toBeCloseTo(
      75_000,
      -1,
    );
    expect(first[2]!.delayMs).toBeGreaterThan(first[1]!.delayMs);
  });

  it("uses speed only for playback delay and emits the same normalized records", async () => {
    const sleep = vi.fn(async () => undefined);
    const records = [scoreRecord(2), scoreRecord(1), scoreRecord(3)];
    const emitted: MatchScoreRecord[] = [];
    for await (const record of replayScoreRecords(records, {
      targetDurationMs: 8_000,
      speed: 4,
      sleep,
    })) {
      emitted.push(record);
    }
    expect(emitted.map((record) => record.sequence)).toEqual([1, 2, 3]);
    expect(sleep.mock.calls.reduce((sum, [delay]) => sum + delay, 0)).toBe(
      2_000,
    );
  });

  it("resumes safely because the reducer ignores replayed or stale sequences", () => {
    const started = setReplayStatus(
      initialReplayState("18241006", 3),
      "running",
    );
    const afterOne = reduceReplayRecord(started, scoreRecord(1));
    const duplicate = reduceReplayRecord(afterOne, scoreRecord(1));
    const final = reduceReplayRecord(
      duplicate,
      scoreRecord(3, {
        action: "game_finalised",
        lifecycle: "finalized",
        statusId: 100,
        isFinal: true,
        stats: { "1": 1, "2": 2, "7": 1, "8": 6 },
      }),
    );
    expect(duplicate).toBe(afterOne);
    expect(final).toMatchObject({
      status: "complete",
      processedRecords: 2,
      progress: 2 / 3,
      currentSequence: 3,
      lifecycle: "finalized",
    });
  });
});
