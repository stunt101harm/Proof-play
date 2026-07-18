"use client";

import Link from "next/link";
import { useState } from "react";

import { LiveScoreMonitor } from "@/components/live-score-monitor";
import { MatchOdds } from "@/components/match-odds";
import { ReplayMatch } from "@/components/replay-match";
import { DEMO_POOL, type SeededFixture } from "@/lib/demo-data";

export function MatchCenter({ fixture }: { fixture: SeededFixture }) {
  const [mode, setMode] = useState<"replay" | "live">("replay");
  const participantNames: [string, string] = [
    fixture.participants[0].name,
    fixture.participants[1].name,
  ];

  return (
    <>
      <div className="mode-switch" aria-label="Match data mode">
        <button
          type="button"
          className={mode === "replay" ? "is-active" : ""}
          onClick={() => setMode("replay")}
          aria-pressed={mode === "replay"}
        >
          Historical replay
        </button>
        <button
          type="button"
          className={mode === "live" ? "is-active" : ""}
          onClick={() => setMode("live")}
          aria-pressed={mode === "live"}
        >
          Live SSE
        </button>
        <span>
          Both modes consume the same normalized score record and reducer.
        </span>
      </div>

      {mode === "replay" ? (
        <ReplayMatch
          fixtureId={fixture.fixtureId}
          participantNames={participantNames}
          conditionStatement={
            fixture.fixtureId === "18241006"
              ? DEMO_POOL.statement
              : "Explore this completed fixture from ordered TxLINE history."
          }
        />
      ) : (
        <LiveScoreMonitor
          fixtureId={fixture.fixtureId}
          participantNames={participantNames}
        />
      )}

      <div className="match-lower-grid">
        <MatchOdds fixtureId={fixture.fixtureId} />
        <article className="match-side-panel active-pool-card">
          <span className="eyebrow">Active prediction pool</span>
          <h2>
            {fixture.fixtureId === "18241006"
              ? DEMO_POOL.statement
              : "Create a verifiable condition for this match."}
          </h2>
          {fixture.fixtureId === "18241006" ? (
            <>
              <div className="pool-split">
                <div>
                  <span>YES</span>
                  <strong>4</strong>
                  <small>demo tokens</small>
                </div>
                <div>
                  <span>NO</span>
                  <strong>6</strong>
                  <small>demo tokens</small>
                </div>
              </div>
              <Link href="/receipt">Open verified Proof Receipt</Link>
            </>
          ) : (
            <Link href={`/create/${fixture.fixtureId}`}>Build a condition</Link>
          )}
        </article>
      </div>
    </>
  );
}
