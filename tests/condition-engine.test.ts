import {
  CONDITION_LIMITS,
  CONDITION_TEMPLATES,
  ConditionCompilerError,
  TXLINE_STAT_KEYS,
  canonicalizeJson,
  compileCondition,
  evaluateCondition,
  normalizeCondition,
} from "@proof-play/condition-engine";
import { describe, expect, it } from "vitest";

const condition = (legs: unknown[], fixtureId = "18241006") => ({
  version: 1,
  fixtureId,
  operator: "all",
  legs,
});

async function expectCompilerError(
  input: unknown,
  code: ConditionCompilerError["code"],
): Promise<void> {
  try {
    await compileCondition(input);
    throw new Error("Expected condition compilation to fail.");
  } catch (error) {
    expect(error).toBeInstanceOf(ConditionCompilerError);
    expect(error).toMatchObject({ code });
  }
}

describe("condition schema and canonicalization", () => {
  it("publishes the five P0 market templates", () => {
    expect(CONDITION_TEMPLATES.map((template) => template.kind)).toEqual([
      "participantWins",
      "totalGoals",
      "bothTeamsScore",
      "winningMargin",
      "totalCorners",
    ]);
  });

  it("canonicalizes JSON by sorting object keys and preserving array order", () => {
    expect(
      canonicalizeJson({
        z: [3, 2, 1],
        a: { y: true, x: "value" },
        n: -0,
      }),
    ).toBe('{"a":{"x":"value","y":true},"n":0,"z":[3,2,1]}');
  });

  it("normalizes leg order with the compiler v1 comparator", () => {
    expect(
      normalizeCondition(
        condition([
          { kind: "totalCorners", comparison: "atMost", threshold: 7 },
          { kind: "participantWins", participant: 2 },
        ]),
      ).legs,
    ).toEqual([
      { kind: "participantWins", participant: 2 },
      { kind: "totalCorners", comparison: "atMost", threshold: 7 },
    ]);
  });

  it("rejects malformed and incomplete condition documents", async () => {
    await expectCompilerError(null, "INVALID_SCHEMA");
    await expectCompilerError(
      { ...condition([{ kind: "bothTeamsScore" }]), unexpected: true },
      "INVALID_SCHEMA",
    );
    await expectCompilerError(
      condition([{ kind: "participantWins" }]),
      "INVALID_SCHEMA",
    );
    await expectCompilerError(
      condition([{ kind: "bothTeamsScore", threshold: 1 }]),
      "INVALID_SCHEMA",
    );
    await expectCompilerError(
      { ...condition([{ kind: "bothTeamsScore" }]), version: 2 },
      "UNSUPPORTED_VERSION",
    );
    await expectCompilerError(
      { ...condition([{ kind: "bothTeamsScore" }]), operator: "any" },
      "INVALID_SCHEMA",
    );
  });

  it("rejects invalid fixture IDs and leg counts", async () => {
    await expect(
      compileCondition(
        condition([{ kind: "bothTeamsScore" }], "9223372036854775807"),
      ),
    ).resolves.toBeDefined();
    await expectCompilerError(
      condition([{ kind: "bothTeamsScore" }], "018241006"),
      "INVALID_FIXTURE_ID",
    );
    await expectCompilerError(
      condition([{ kind: "bothTeamsScore" }], "9223372036854775808"),
      "INVALID_FIXTURE_ID",
    );
    await expectCompilerError(condition([], "18241006"), "INVALID_LEG_COUNT");
    await expectCompilerError(
      condition([
        { kind: "bothTeamsScore" },
        { kind: "participantWins", participant: 1 },
        { kind: "totalGoals", comparison: "atLeast", threshold: 3 },
      ]),
      "INVALID_LEG_COUNT",
    );
  });

  it("rejects unsupported templates, including deferred card markets", async () => {
    await expectCompilerError(
      condition([{ kind: "totalCards", comparison: "atLeast", threshold: 3 }]),
      "UNSUPPORTED_CONDITION",
    );
  });

  it("rejects invalid template parameters", async () => {
    await expectCompilerError(
      condition([{ kind: "participantWins", participant: 3 }]),
      "INVALID_SCHEMA",
    );
    await expectCompilerError(
      condition([{ kind: "totalGoals", comparison: "equal", threshold: 3 }]),
      "INVALID_SCHEMA",
    );
    await expectCompilerError(
      condition([
        { kind: "totalCorners", comparison: "atLeast", threshold: "3" },
      ]),
      "INVALID_SCHEMA",
    );
  });

  it("rejects duplicate and contradictory legs", async () => {
    await expectCompilerError(
      condition([{ kind: "bothTeamsScore" }, { kind: "bothTeamsScore" }]),
      "DUPLICATE_LEG",
    );
    await expectCompilerError(
      condition([
        { kind: "participantWins", participant: 1 },
        { kind: "participantWins", participant: 2 },
      ]),
      "CONTRADICTORY_LEGS",
    );
    await expectCompilerError(
      condition([
        { kind: "participantWins", participant: 1 },
        { kind: "winningMargin", participant: 2, threshold: 2 },
      ]),
      "CONTRADICTORY_LEGS",
    );
    await expectCompilerError(
      condition([
        { kind: "totalGoals", comparison: "atLeast", threshold: 4 },
        { kind: "totalGoals", comparison: "atMost", threshold: 3 },
      ]),
      "CONTRADICTORY_LEGS",
    );
    await expectCompilerError(
      condition([
        { kind: "bothTeamsScore" },
        { kind: "totalGoals", comparison: "atMost", threshold: 1 },
      ]),
      "CONTRADICTORY_LEGS",
    );
    await expectCompilerError(
      condition([
        { kind: "winningMargin", participant: 1, threshold: 3 },
        { kind: "totalGoals", comparison: "atMost", threshold: 2 },
      ]),
      "CONTRADICTORY_LEGS",
    );
  });

  it("rejects compound legs that would evaluate a TxLINE stat index twice", async () => {
    await expectCompilerError(
      condition([
        { kind: "participantWins", participant: 2 },
        { kind: "totalGoals", comparison: "atLeast", threshold: 3 },
      ]),
      "DUPLICATE_STAT_COVERAGE",
    );
    await expectCompilerError(
      condition([
        { kind: "totalGoals", comparison: "atLeast", threshold: 2 },
        { kind: "totalGoals", comparison: "atMost", threshold: 4 },
      ]),
      "DUPLICATE_STAT_COVERAGE",
    );
  });

  it("enforces documented integer threshold bounds", async () => {
    await expect(
      compileCondition(
        condition([{ kind: "totalGoals", comparison: "atMost", threshold: 0 }]),
      ),
    ).resolves.toBeDefined();
    await expect(
      compileCondition(
        condition([
          {
            kind: "totalGoals",
            comparison: "atLeast",
            threshold: CONDITION_LIMITS.maxGoalThreshold,
          },
        ]),
      ),
    ).resolves.toBeDefined();
    await expect(
      compileCondition(
        condition([
          {
            kind: "winningMargin",
            participant: 1,
            threshold: CONDITION_LIMITS.maxWinningMargin,
          },
        ]),
      ),
    ).resolves.toBeDefined();
    await expect(
      compileCondition(
        condition([
          {
            kind: "totalCorners",
            comparison: "atMost",
            threshold: CONDITION_LIMITS.maxCornerThreshold,
          },
        ]),
      ),
    ).resolves.toBeDefined();

    await expectCompilerError(
      condition([{ kind: "totalGoals", comparison: "atLeast", threshold: 0 }]),
      "ALREADY_DECIDED",
    );
    await expectCompilerError(
      condition([
        { kind: "totalCorners", comparison: "atLeast", threshold: 0 },
      ]),
      "ALREADY_DECIDED",
    );
    await expectCompilerError(
      condition([
        {
          kind: "totalGoals",
          comparison: "atLeast",
          threshold: CONDITION_LIMITS.maxGoalThreshold + 1,
        },
      ]),
      "INVALID_SCHEMA",
    );
    await expectCompilerError(
      condition([{ kind: "winningMargin", participant: 1, threshold: 0 }]),
      "INVALID_SCHEMA",
    );
    await expectCompilerError(
      condition([
        { kind: "totalCorners", comparison: "atMost", threshold: 1.5 },
      ]),
      "INVALID_SCHEMA",
    );
  });
});

describe("TxLINE strategy compilation", () => {
  it.each([
    {
      name: "participant 1 wins",
      leg: { kind: "participantWins", participant: 1 },
      statKeys: [1, 2],
      predicates: [
        {
          binary: {
            indexA: 0,
            indexB: 1,
            op: { subtract: {} },
            predicate: { threshold: 0, comparison: { greaterThan: {} } },
          },
        },
      ],
    },
    {
      name: "participant 2 wins",
      leg: { kind: "participantWins", participant: 2 },
      statKeys: [1, 2],
      predicates: [
        {
          binary: {
            indexA: 1,
            indexB: 0,
            op: { subtract: {} },
            predicate: { threshold: 0, comparison: { greaterThan: {} } },
          },
        },
      ],
    },
    {
      name: "total goals at least",
      leg: { kind: "totalGoals", comparison: "atLeast", threshold: 3 },
      statKeys: [1, 2],
      predicates: [
        {
          binary: {
            indexA: 0,
            indexB: 1,
            op: { add: {} },
            predicate: { threshold: 2, comparison: { greaterThan: {} } },
          },
        },
      ],
    },
    {
      name: "total goals at most",
      leg: { kind: "totalGoals", comparison: "atMost", threshold: 2 },
      statKeys: [1, 2],
      predicates: [
        {
          binary: {
            indexA: 0,
            indexB: 1,
            op: { add: {} },
            predicate: { threshold: 3, comparison: { lessThan: {} } },
          },
        },
      ],
    },
    {
      name: "both teams score",
      leg: { kind: "bothTeamsScore" },
      statKeys: [1, 2],
      predicates: [
        {
          single: {
            index: 0,
            predicate: { threshold: 0, comparison: { greaterThan: {} } },
          },
        },
        {
          single: {
            index: 1,
            predicate: { threshold: 0, comparison: { greaterThan: {} } },
          },
        },
      ],
    },
    {
      name: "winning margin",
      leg: { kind: "winningMargin", participant: 2, threshold: 2 },
      statKeys: [1, 2],
      predicates: [
        {
          binary: {
            indexA: 1,
            indexB: 0,
            op: { subtract: {} },
            predicate: { threshold: 1, comparison: { greaterThan: {} } },
          },
        },
      ],
    },
    {
      name: "total corners",
      leg: { kind: "totalCorners", comparison: "atMost", threshold: 7 },
      statKeys: [7, 8],
      predicates: [
        {
          binary: {
            indexA: 0,
            indexB: 1,
            op: { add: {} },
            predicate: { threshold: 8, comparison: { lessThan: {} } },
          },
        },
      ],
    },
  ])(
    "compiles $name with correct stat indexes",
    async ({ leg, statKeys, predicates }) => {
      const compiled = await compileCondition(condition([leg]));

      expect(compiled.statKeys).toEqual(statKeys);
      expect(compiled.strategy).toEqual({
        geometricTargets: [],
        distancePredicate: null,
        discretePredicates: predicates,
      });
    },
  );

  it("compiles a bounded AND compound into one stable four-stat V3 strategy", async () => {
    const compiled = await compileCondition(
      condition([
        { kind: "totalCorners", comparison: "atMost", threshold: 7 },
        { kind: "participantWins", participant: 2 },
      ]),
    );

    expect(compiled.validationMethod).toBe("validateStatV3");
    expect(compiled.statKeys).toEqual([
      TXLINE_STAT_KEYS.participant1Goals,
      TXLINE_STAT_KEYS.participant2Goals,
      TXLINE_STAT_KEYS.participant1Corners,
      TXLINE_STAT_KEYS.participant2Corners,
    ]);
    expect(compiled.strategy.discretePredicates).toEqual([
      {
        binary: {
          indexA: 1,
          indexB: 0,
          op: { subtract: {} },
          predicate: { threshold: 0, comparison: { greaterThan: {} } },
        },
      },
      {
        binary: {
          indexA: 2,
          indexB: 3,
          op: { add: {} },
          predicate: { threshold: 8, comparison: { lessThan: {} } },
        },
      },
    ]);
    expect(compiled.compiledLegs.map((leg) => leg.predicateIndexes)).toEqual([
      [0],
      [1],
    ]);
    expect(new Set(compiled.statKeys).size).toBe(compiled.statKeys.length);
  });

  it("produces identical canonical JSON, commitments, stat order, and strategy for reordered input", async () => {
    const first = await compileCondition(
      condition([
        { kind: "participantWins", participant: 2 },
        { kind: "totalCorners", comparison: "atMost", threshold: 7 },
      ]),
    );
    const second = await compileCondition(
      condition([
        { kind: "totalCorners", comparison: "atMost", threshold: 7 },
        { kind: "participantWins", participant: 2 },
      ]),
    );

    expect(second.canonicalJson).toBe(first.canonicalJson);
    expect(second.conditionCommitmentHex).toBe(first.conditionCommitmentHex);
    expect(second.statKeys).toEqual(first.statKeys);
    expect(second.strategy).toEqual(first.strategy);
    expect(first.conditionCommitment).toHaveLength(32);
  });

  it("derives readable display text without committing mutable team names", async () => {
    const input = condition([
      { kind: "participantWins", participant: 2 },
      { kind: "totalCorners", comparison: "atLeast", threshold: 5 },
    ]);
    const generic = await compileCondition(input);
    const named = await compileCondition(input, {
      participantNames: { 1: "North FC", 2: "South FC" },
    });

    expect(generic.humanStatement).toBe(
      "Participant 2 wins and total corners are at least 5.",
    );
    expect(named.humanStatement).toBe(
      "South FC wins and total corners are at least 5.",
    );
    expect(named.conditionCommitmentHex).toBe(generic.conditionCommitmentHex);
    expect(named.canonicalJson).not.toContain("South FC");
  });

  it("locks a stable canonical document and SHA-256 commitment", async () => {
    const compiled = await compileCondition(
      condition([
        { kind: "participantWins", participant: 2 },
        { kind: "totalCorners", comparison: "atMost", threshold: 7 },
      ]),
    );

    expect(compiled.canonicalJson).toBe(
      '{"fixtureId":"18241006","legs":[{"kind":"participantWins","participant":2},{"comparison":"atMost","kind":"totalCorners","threshold":7}],"operator":"all","version":1}',
    );
    expect(compiled.conditionCommitmentHex).toBe(
      "d2e7ea3af5761bfa010397b9f3ad89acdb579190666ac5a158106d3ccc771bf3",
    );
  });
});

describe("local condition evaluation", () => {
  it("evaluates the known TxLINE final score and four-stat compound", async () => {
    const compiled = await compileCondition(
      condition([
        { kind: "participantWins", participant: 2 },
        { kind: "totalCorners", comparison: "atMost", threshold: 7 },
      ]),
    );
    const result = evaluateCondition(compiled, {
      1: 1,
      2: 2,
      7: 1,
      8: 6,
    });

    expect(result).toMatchObject({
      status: "resolved",
      outcome: true,
      missingStatKeys: [],
    });
    expect(result.legs.map((leg) => leg.outcome)).toEqual([true, true]);
  });

  it("returns a resolved false result when any AND leg fails", async () => {
    const compiled = await compileCondition(
      condition([
        { kind: "participantWins", participant: 2 },
        { kind: "totalCorners", comparison: "atMost", threshold: 6 },
      ]),
    );
    const result = evaluateCondition(compiled, {
      1: 1,
      2: 2,
      7: 1,
      8: 6,
    });

    expect(result.outcome).toBe(false);
    expect(result.legs.map((leg) => leg.outcome)).toEqual([true, false]);
  });

  it("fails closed when a required stat is absent", async () => {
    const compiled = await compileCondition(
      condition([{ kind: "bothTeamsScore" }]),
    );
    const result = evaluateCondition(compiled, { 1: 1 });

    expect(result).toMatchObject({
      status: "missingStats",
      outcome: null,
      missingStatKeys: [2],
    });
    expect(result.legs[0]?.outcome).toBeNull();
  });

  it("rejects non-integer stat values instead of inferring an outcome", async () => {
    const compiled = await compileCondition(
      condition([{ kind: "bothTeamsScore" }]),
    );

    expect(() => evaluateCondition(compiled, { 1: 1, 2: Number.NaN })).toThrow(
      expect.objectContaining({ code: "INVALID_STATS" }),
    );
    expect(() => evaluateCondition(compiled, { 1: 1, 2: -1 })).toThrow(
      expect.objectContaining({ code: "INVALID_STATS" }),
    );
  });
});
