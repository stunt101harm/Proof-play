"use client";

import type { MatchScoreRecord } from "@proof-play/domain";
import {
  initialReplayState,
  reduceReplayRecord,
  setReplayStatus,
} from "@proof-play/replay";
import { useCallback, useEffect, useRef, useState } from "react";

export function LiveScoreMonitor({
  fixtureId,
  participantNames,
}: {
  fixtureId: string;
  participantNames: [string, string];
}) {
  const [state, setState] = useState(() =>
    initialReplayState(fixtureId, 0, "live"),
  );
  const [connection, setConnection] = useState<
    "connecting" | "connected" | "reconnecting" | "stale"
  >("connecting");
  const source = useRef<EventSource | null>(null);
  const staleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const markActive = useCallback((isFinal = false) => {
    if (staleTimer.current) clearTimeout(staleTimer.current);
    setConnection("connected");
    staleTimer.current = isFinal
      ? null
      : setTimeout(() => setConnection("stale"), 15_000);
  }, []);

  const connect = useCallback(() => {
    source.current?.close();
    const events = new EventSource(
      `/api/txline/scores/stream?fixtureId=${fixtureId}`,
    );
    source.current = events;
    events.onopen = () => {
      markActive();
      setState((current) => setReplayStatus(current, "running"));
    };
    events.addEventListener("score", (event) => {
      const record = JSON.parse(
        (event as MessageEvent).data,
      ) as MatchScoreRecord;
      markActive(record.isFinal);
      setState((current) => reduceReplayRecord(current, record));
    });
    events.addEventListener("error", () => {
      setConnection("reconnecting");
    });
    events.onerror = () => setConnection("reconnecting");
  }, [fixtureId, markActive]);

  useEffect(() => {
    connect();
    return () => {
      source.current?.close();
      source.current = null;
      if (staleTimer.current) clearTimeout(staleTimer.current);
    };
  }, [connect]);

  return (
    <section className="live-monitor" aria-label="Live TxLINE match monitor">
      <div className="replay-toolbar">
        <div>
          <span className="eyebrow">Live normalized feed</span>
          <strong>Fixture {fixtureId}</strong>
        </div>
        <div className="replay-source">
          <span className="status-dot" aria-hidden="true" />
          LIVE · TxLINE SSE · {connection}
        </div>
      </div>
      <div className="scoreboard scoreboard--live">
        <div className="scoreboard__participant">
          <span>{participantNames[0]}</span>
          <strong>{state.score?.participant1.goals ?? "–"}</strong>
        </div>
        <div className="scoreboard__state">
          <span>
            {state.gameState?.replaceAll("_", " ") ?? state.lifecycle}
          </span>
          <small>
            {state.action ?? "Awaiting next live event"}
            {state.period !== null ? ` · period ${state.period}` : ""}
          </small>
        </div>
        <div className="scoreboard__participant scoreboard__participant--right">
          <span>{participantNames[1]}</span>
          <strong>{state.score?.participant2.goals ?? "–"}</strong>
        </div>
      </div>
      <div className="live-monitor__body">
        <div>
          <span>Last sequence</span>
          <strong>{state.currentSequence ?? "–"}</strong>
        </div>
        <div>
          <span>Events received</span>
          <strong>{state.processedRecords}</strong>
        </div>
        <ol className="event-list">
          {state.timeline
            .slice(-5)
            .reverse()
            .map((item) => (
              <li key={item.sequence}>
                <span>#{item.sequence}</span>
                <strong>{item.action}</strong>
                <small>
                  {item.gameState?.replaceAll("_", " ") ?? item.lifecycle}
                  {item.period !== null ? ` · period ${item.period}` : ""}
                </small>
              </li>
            ))}
          {!state.timeline.length ? (
            <li>No new event yet. Final fixtures may remain quiet.</li>
          ) : null}
        </ol>
      </div>
      {connection === "reconnecting" || connection === "stale" ? (
        <div className="data-banner" data-state="fallback">
          <div>
            <strong>
              {connection === "stale"
                ? "Live data may be stale"
                : "Live stream reconnecting"}
            </strong>
            <small>
              {connection === "stale"
                ? "No update arrived for 15 seconds; the last normalized state remains visible."
                : "EventSource retries automatically; historical replay is available now."}
            </small>
          </div>
          <button type="button" onClick={connect}>
            Retry now
          </button>
        </div>
      ) : null}
    </section>
  );
}
