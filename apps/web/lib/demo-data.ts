import type { MatchFixture } from "@proof-play/domain";

export type SeededFixture = MatchFixture & {
  coverage: "verified" | "replayReady";
  displayState: "final";
};

export const DEMO_FIXTURE_ID = "18241006";
export const DEMO_FIXTURE_START_EPOCH_DAY = 20_635;
export const DEMO_COMPETITION_ID = 72;

function fixture(input: {
  fixtureId: string;
  fixtureGroupId: string;
  startsAt: string;
  sourceUpdatedAt: string;
  participant1: { id: string; name: string };
  participant2: { id: string; name: string };
  coverage: SeededFixture["coverage"];
}): SeededFixture {
  return {
    schemaVersion: 1,
    source: "txline",
    fixtureId: input.fixtureId,
    competition: { id: "72", name: "World Cup" },
    fixtureGroupId: input.fixtureGroupId,
    startsAt: input.startsAt,
    sourceUpdatedAt: input.sourceUpdatedAt,
    lifecycle: "scheduled",
    participants: [
      {
        position: 1,
        id: input.participant1.id,
        name: input.participant1.name,
        designation: "home",
      },
      {
        position: 2,
        id: input.participant2.id,
        name: input.participant2.name,
        designation: "away",
      },
    ],
    coverage: input.coverage,
    displayState: "final",
  };
}

/**
 * Normalized, non-raw fixture metadata selected from the covered TxLINE
 * snapshot. Historical score payloads remain on the TxLINE API boundary.
 */
export const SEEDED_FIXTURES: readonly SeededFixture[] = [
  fixture({
    fixtureId: "18179550",
    fixtureGroupId: "10115677",
    startsAt: "2026-07-01T20:00:00.000Z",
    sourceUpdatedAt: "2026-07-04T14:00:00.000Z",
    participant1: { id: "1575", name: "Belgium" },
    participant2: { id: "1289", name: "Senegal" },
    coverage: "replayReady",
  }),
  fixture({
    fixtureId: "18202783",
    fixtureGroupId: "10115574",
    startsAt: "2026-07-07T20:00:00.000Z",
    sourceUpdatedAt: "2026-07-08T00:00:00.000Z",
    participant1: { id: "3099", name: "Switzerland" },
    participant2: { id: "1748", name: "Colombia" },
    coverage: "replayReady",
  }),
  fixture({
    fixtureId: "18237038",
    fixtureGroupId: "10115573",
    startsAt: "2026-07-14T19:00:00.000Z",
    sourceUpdatedAt: "2026-07-14T23:00:00.000Z",
    participant1: { id: "1999", name: "France" },
    participant2: { id: "3021", name: "Spain" },
    coverage: "replayReady",
  }),
  fixture({
    fixtureId: DEMO_FIXTURE_ID,
    fixtureGroupId: "10115573",
    startsAt: "2026-07-15T19:00:00.000Z",
    sourceUpdatedAt: "2026-07-15T23:00:00.000Z",
    participant1: { id: "1888", name: "England" },
    participant2: { id: "1489", name: "Argentina" },
    coverage: "verified",
  }),
] as const;

export const DEMO_FIXTURE = SEEDED_FIXTURES.at(-1)!;

export const DEMO_POOL = {
  address: "3fCNRpakrJdsoaG46xFuHqMUK2YZM9FyvwuJediB5PhD",
  statement: "Argentina wins and total corners are at most 7.",
  conditionCanonicalJson:
    '{"fixtureId":"18241006","legs":[{"kind":"participantWins","participant":2},{"comparison":"atMost","kind":"totalCorners","threshold":7}],"operator":"all","version":1}',
  participant1FinalScore: 1,
  participant2FinalScore: 2,
  participant1FinalCorners: 1,
  participant2FinalCorners: 6,
  yesSeedAmount: 3,
  noSeedAmount: 6,
  joinAmount: 1,
  finalYesAmount: 4,
  finalNoAmount: 6,
  settlementSequence: 962,
  settlementTransaction:
    "5DBFhtF8dmg8iPH63RW74px3BrYbfAG1FZJzEiYpEChsUPrateGudXESKiJuyMxjhunVwPyyAeGYFytXucsqrqWH",
} as const;

export function seededFixture(fixtureId: string) {
  return SEEDED_FIXTURES.find((candidate) => candidate.fixtureId === fixtureId);
}

export function groupFixturesByDate(fixtures: readonly MatchFixture[]) {
  const groups = new Map<string, MatchFixture[]>();
  for (const item of [...fixtures].sort((left, right) =>
    left.startsAt.localeCompare(right.startsAt),
  )) {
    const key = item.startsAt.slice(0, 10);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups.entries()].map(([date, items]) => ({ date, items }));
}
