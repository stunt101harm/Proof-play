"use client";

import type { MatchOddsMarket } from "@proof-play/domain";
import { useEffect, useState } from "react";

type OddsResponse = {
  data?: MatchOddsMarket[];
  error?: { message?: string };
};

function marketLabel(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function outcomeLabel(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/^./, (letter) => letter.toUpperCase());
}

async function fetchOdds(fixtureId: string) {
  const response = await fetch(`/api/txline/odds/${fixtureId}`, {
    headers: { Accept: "application/json" },
  });
  const body = (await response.json()) as OddsResponse;
  if (!response.ok) throw new Error(body.error?.message);
  return body.data ?? [];
}

export function MatchOdds({ fixtureId }: { fixtureId: string }) {
  const [markets, setMarkets] = useState<MatchOddsMarket[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "empty" | "error">(
    "loading",
  );

  async function load() {
    try {
      const returned = await fetchOdds(fixtureId);
      setMarkets(returned.slice(0, 3));
      setState(returned.length ? "ready" : "empty");
    } catch {
      setMarkets([]);
      setState("error");
    }
  }

  useEffect(() => {
    let active = true;
    void fetchOdds(fixtureId)
      .then((returned) => {
        if (!active) return;
        setMarkets(returned.slice(0, 3));
        setState(returned.length ? "ready" : "empty");
      })
      .catch(() => {
        if (!active) return;
        setMarkets([]);
        setState("error");
      });
    return () => {
      active = false;
    };
  }, [fixtureId]);

  return (
    <article className="match-side-panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">TxLINE consensus odds</span>
          <h2>Markets actually returned</h2>
        </div>
        {state === "error" ? (
          <button
            type="button"
            onClick={() => {
              setState("loading");
              void load();
            }}
          >
            Retry
          </button>
        ) : null}
      </div>
      {state === "loading" ? (
        <p className="panel-status">Loading the latest available snapshot…</p>
      ) : null}
      {state === "empty" ? (
        <p className="panel-status">
          TxLINE returned no odds markets for this snapshot, so none are shown.
        </p>
      ) : null}
      {state === "error" ? (
        <p className="panel-status">
          Odds are temporarily unavailable. Match and replay data remain usable.
        </p>
      ) : null}
      {markets.length ? (
        <div className="odds-list">
          {markets.map((market) => (
            <section key={market.messageId}>
              <header>
                <strong>{marketLabel(market.marketType)}</strong>
                <span>{market.marketPeriod ?? "Full match"}</span>
              </header>
              <div>
                {market.outcomes.map((outcome) => (
                  <span key={outcome.key}>
                    <small>{outcomeLabel(outcome.key)}</small>
                    <strong>
                      {outcome.probabilityPercent !== null
                        ? `${outcome.probabilityPercent.toFixed(1)}%`
                        : (outcome.rawPrice ?? "–")}
                    </strong>
                  </span>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : null}
    </article>
  );
}
