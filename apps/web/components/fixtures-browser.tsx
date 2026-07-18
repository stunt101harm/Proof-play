"use client";

import type { MatchFixture } from "@proof-play/domain";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import {
  DEMO_COMPETITION_ID,
  DEMO_FIXTURE_ID,
  DEMO_FIXTURE_START_EPOCH_DAY,
  SEEDED_FIXTURES,
  groupFixturesByDate,
  seededFixture,
} from "@/lib/demo-data";

type FixtureResponse = { data?: MatchFixture[]; error?: { message?: string } };
type SourceState = "loading" | "live" | "fallback";

function displayDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

function displayTime(value: string) {
  return new Intl.DateTimeFormat("en", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(new Date(value));
}

function mergeFixtures(records: MatchFixture[]) {
  const byId = new Map(records.map((item) => [item.fixtureId, item]));
  for (const seeded of SEEDED_FIXTURES) byId.set(seeded.fixtureId, seeded);
  return [...byId.values()];
}

async function fetchFixtures() {
  const response = await fetch(
    `/api/txline/fixtures?competitionId=${DEMO_COMPETITION_ID}&startEpochDay=${DEMO_FIXTURE_START_EPOCH_DAY}`,
    { headers: { Accept: "application/json" } },
  );
  const body = (await response.json()) as FixtureResponse;
  if (!response.ok || !body.data?.length) {
    throw new Error(body.error?.message ?? "No covered fixtures returned.");
  }
  return mergeFixtures(body.data);
}

export function FixturesBrowser() {
  const [fixtures, setFixtures] = useState<MatchFixture[]>([
    ...SEEDED_FIXTURES,
  ]);
  const [sourceState, setSourceState] = useState<SourceState>("loading");
  const [query, setQuery] = useState("");
  const [replayOnly, setReplayOnly] = useState(false);

  async function load() {
    try {
      setFixtures(await fetchFixtures());
      setSourceState("live");
    } catch {
      setFixtures([...SEEDED_FIXTURES]);
      setSourceState("fallback");
    }
  }

  useEffect(() => {
    let active = true;
    void fetchFixtures()
      .then((records) => {
        if (!active) return;
        setFixtures(records);
        setSourceState("live");
      })
      .catch(() => {
        if (!active) return;
        setFixtures([...SEEDED_FIXTURES]);
        setSourceState("fallback");
      });
    return () => {
      active = false;
    };
  }, []);

  const visible = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return fixtures.filter((item) => {
      const isReplayReady = seededFixture(item.fixtureId) !== undefined;
      const matchesQuery =
        !normalizedQuery ||
        item.fixtureId.includes(normalizedQuery) ||
        item.participants.some((participant) =>
          participant.name.toLowerCase().includes(normalizedQuery),
        );
      return matchesQuery && (!replayOnly || isReplayReady);
    });
  }, [fixtures, query, replayOnly]);

  const groups = groupFixturesByDate(visible);

  return (
    <section className="fixtures-shell" aria-label="Covered TxLINE fixtures">
      <div className="data-banner" data-state={sourceState}>
        <span className="status-dot" aria-hidden="true" />
        <div>
          <strong>
            {sourceState === "live"
              ? "Connected to normalized TxLINE fixtures"
              : sourceState === "loading"
                ? "Loading normalized TxLINE fixtures"
                : "Live catalog unavailable · verified replay catalog shown"}
          </strong>
          <small>Devnet · server credentials never enter the browser</small>
        </div>
        {sourceState === "fallback" ? (
          <button
            type="button"
            onClick={() => {
              setSourceState("loading");
              void load();
            }}
          >
            Retry
          </button>
        ) : null}
      </div>

      <div className="fixture-filters">
        <label>
          <span>Find a team or fixture</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search covered matches"
          />
        </label>
        <label className="toggle-label">
          <input
            type="checkbox"
            checked={replayOnly}
            onChange={(event) => setReplayOnly(event.target.checked)}
          />
          Replay-ready only
        </label>
      </div>

      <div className="fixture-groups" aria-live="polite">
        {groups.map((group) => (
          <section className="fixture-group" key={group.date}>
            <header>
              <h2>{displayDate(`${group.date}T00:00:00.000Z`)}</h2>
              <span>{group.items.length} covered</span>
            </header>
            <div className="fixture-list">
              {group.items.map((item) => {
                const seeded = seededFixture(item.fixtureId);
                const isVerified = item.fixtureId === DEMO_FIXTURE_ID;
                return (
                  <article
                    className={`fixture-row${isVerified ? " fixture-row--featured" : ""}`}
                    key={item.fixtureId}
                  >
                    <div className="fixture-row__time">
                      <strong>{displayTime(item.startsAt)}</strong>
                      <span>#{item.fixtureId}</span>
                    </div>
                    <div className="fixture-row__teams">
                      <strong>{item.participants[0].name}</strong>
                      <span>vs</span>
                      <strong>{item.participants[1].name}</strong>
                    </div>
                    <div className="fixture-row__coverage">
                      <span>{seeded ? "Final · replay ready" : "Covered"}</span>
                      <small>Fixture group {item.fixtureGroupId}</small>
                      {isVerified ? <small>Proof verified</small> : null}
                    </div>
                    {seeded ? (
                      <Link href={`/matches/${item.fixtureId}`}>
                        Open match
                      </Link>
                    ) : (
                      <span className="fixture-row__unavailable">
                        Live catalog
                      </span>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        ))}
        {!groups.length ? (
          <div className="empty-state">
            <strong>No fixtures match those filters.</strong>
            <span>Clear search or include the complete covered catalog.</span>
          </div>
        ) : null}
      </div>
    </section>
  );
}
