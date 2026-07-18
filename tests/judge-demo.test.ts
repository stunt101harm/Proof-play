import { describe, expect, it } from "vitest";

import {
  DEMO_FIXTURE,
  DEMO_FIXTURE_ID,
  DEMO_POOL,
  SEEDED_FIXTURES,
  groupFixturesByDate,
  seededFixture,
} from "../apps/web/lib/demo-data";
import { initialDemoState, reduceDemoState } from "../apps/web/lib/demo-state";

const commitment = "ab".repeat(32);

describe("Judge Demo state machine", () => {
  it("guards the golden path until every preceding proof step completes", () => {
    const initial = initialDemoState();
    expect(
      reduceDemoState(initial, {
        type: "compileCondition",
        conditionCommitment: commitment,
      }),
    ).toBe(initial);

    const build = reduceDemoState(initial, {
      type: "selectFixture",
      fixtureId: DEMO_FIXTURE_ID,
    });
    const join = reduceDemoState(build, {
      type: "compileCondition",
      conditionCommitment: commitment,
    });
    const replay = reduceDemoState(join, {
      type: "joinPool",
      side: "yes",
      amount: DEMO_POOL.joinAmount,
    });

    expect(reduceDemoState(replay, { type: "openSettlement" })).toBe(replay);

    const completed = reduceDemoState(replay, { type: "completeReplay" });
    expect(
      reduceDemoState(completed, { type: "openSettlement" }),
    ).toMatchObject({
      stage: "settlement",
      fixtureId: DEMO_FIXTURE_ID,
      conditionCommitment: commitment,
      side: "yes",
      replayComplete: true,
    });
  });

  it("rejects malformed input and resets every demo value", () => {
    const initial = initialDemoState();
    expect(
      reduceDemoState(initial, { type: "selectFixture", fixtureId: "bad" }),
    ).toBe(initial);

    const build = reduceDemoState(initial, {
      type: "selectFixture",
      fixtureId: DEMO_FIXTURE_ID,
    });
    expect(
      reduceDemoState(build, {
        type: "compileCondition",
        conditionCommitment: "not-a-commitment",
      }),
    ).toBe(build);

    const reset = reduceDemoState(build, { type: "reset" });
    expect(reset).toEqual(initialDemoState(1));
  });
});

describe("seeded normalized fixture catalog", () => {
  it("keeps the verified settlement fixture aligned with real evidence", () => {
    expect(seededFixture(DEMO_FIXTURE_ID)).toBe(DEMO_FIXTURE);
    expect(DEMO_FIXTURE).toMatchObject({
      fixtureId: "18241006",
      coverage: "verified",
      participants: [{ name: "England" }, { name: "Argentina" }],
    });
    expect(DEMO_POOL).toMatchObject({
      participant1FinalScore: 1,
      participant2FinalScore: 2,
      participant1FinalCorners: 1,
      participant2FinalCorners: 6,
      settlementSequence: 962,
    });
  });

  it("sorts fixtures into stable UTC date groups", () => {
    const groups = groupFixturesByDate([...SEEDED_FIXTURES].reverse());
    expect(groups.map((group) => group.date)).toEqual([
      "2026-07-01",
      "2026-07-07",
      "2026-07-14",
      "2026-07-15",
    ]);
    expect(groups.at(-1)?.items[0]?.fixtureId).toBe(DEMO_FIXTURE_ID);
  });
});
