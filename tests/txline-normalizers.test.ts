import { describe, expect, it } from "vitest";
import {
  TxlineDiagnosticError,
  normalizeFixture,
  normalizeOdds,
  normalizeScore,
  normalizeScoreProof,
} from "../packages/txline/src";
import {
  RAW_FIXTURE,
  RAW_ODDS,
  RAW_SCORE_PROOF,
  rawScore,
} from "./fixtures/txline-samples";

describe("TxLINE normalized domain objects", () => {
  it("normalizes fixture IDs, timestamps, and feed home/away designations", () => {
    expect(normalizeFixture(RAW_FIXTURE)).toMatchObject({
      schemaVersion: 1,
      source: "txline",
      fixtureId: "17588223",
      competition: { id: "72", name: "World Cup" },
      lifecycle: "scheduled",
      participants: [
        { position: 1, id: "2545", designation: "home" },
        { position: 2, id: "3013", designation: "away" },
      ],
    });
  });

  it("keeps only markets returned by TxLINE and maps non-numeric probability values", () => {
    const odds = normalizeOdds(RAW_ODDS);
    expect(odds.marketType).toBe("1X2_PARTICIPANT_RESULT");
    expect(odds.outcomes).toEqual([
      { key: "part1", rawPrice: 2926, probabilityPercent: 34.176 },
      { key: "draw", rawPrice: 2155, probabilityPercent: null },
      { key: "part2", rawPrice: 5150, probabilityPercent: 19.417 },
    ]);
  });

  it("normalizes PascalCase score records into stable ordered stats", () => {
    const score = normalizeScore(rawScore(12));
    expect(score).toMatchObject({
      fixtureId: "42",
      sequence: 12,
      action: "status",
      lifecycle: "live",
      participant: 1,
      score: {
        participant1: { goals: 1, yellowCards: 1, corners: 1 },
        participant2: { goals: 2, yellowCards: 3, corners: 6 },
      },
    });
    expect(Object.keys(score.stats)).toEqual(["1", "2", "3", "4", "7", "8"]);
  });

  it("accepts the documented camelCase score shape", () => {
    expect(
      normalizeScore({
        fixtureId: 42,
        gameState: "scheduled",
        startTime: 1_784_142_000_000,
        action: "status",
        ts: 1_784_150_000_001,
        seq: 1,
        statusId: 1,
        stats: { "1": 0, "2": 0 },
      }),
    ).toMatchObject({ fixtureId: "42", sequence: 1, lifecycle: "scheduled" });
  });

  it("preserves action amendments without exposing arbitrary nested raw data", () => {
    const score = normalizeScore(
      rawScore(13, {
        Action: "action_amend",
        Data: {
          Action: "injury",
          Previous: {
            Outcome: "OffPitch",
            PlayerId: 9,
            Nested: { secret: true },
          },
          New: { Outcome: "OnPitch", PlayerId: 9 },
        },
      }),
    );
    expect(score.amendment).toEqual({
      targetAction: "injury",
      previous: { Outcome: "OffPitch", PlayerId: 9 },
      next: { Outcome: "OnPitch", PlayerId: 9 },
    });
  });

  it("recognizes only the documented final record as finalized", () => {
    expect(
      normalizeScore(
        rawScore(962, { Action: "game_finalised", StatusId: 100 }),
      ),
    ).toMatchObject({ lifecycle: "finalized", isFinal: true });
    expect(
      normalizeScore(
        rawScore(425, { Action: "halftime_finalised", StatusId: 3 }),
      ),
    ).toMatchObject({ lifecycle: "paused", isFinal: false });
  });

  it("binds normalized proof data to the requested fixture, sequence, and keys", () => {
    expect(
      normalizeScoreProof(RAW_SCORE_PROOF, {
        fixtureId: "42",
        sequence: 963,
        statKeys: [1],
      }),
    ).toMatchObject({
      fixtureId: "42",
      sequence: 963,
      requestedStatKeys: [1],
      stats: [{ key: 1, value: 1, period: 0 }],
      summary: { fixtureId: "42", updateCount: 1 },
    });
  });

  it("rejects proof branches returned in a different stat-key order", () => {
    expect(() =>
      normalizeScoreProof(RAW_SCORE_PROOF, {
        fixtureId: "42",
        sequence: 963,
        statKeys: [2],
      }),
    ).toThrow(
      expect.objectContaining({
        code: "TXLINE_NORMALIZATION_ERROR",
      } satisfies Partial<TxlineDiagnosticError>),
    );
  });

  it("fails closed when a required source field changes shape", () => {
    expect(() =>
      normalizeFixture({ ...RAW_FIXTURE, FixtureId: "invalid" }),
    ).toThrow(
      expect.objectContaining({
        code: "TXLINE_NORMALIZATION_ERROR",
      } satisfies Partial<TxlineDiagnosticError>),
    );
  });
});
