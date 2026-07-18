"use client";

import type { MatchScoreRecord } from "@proof-play/domain";
import {
  initialReplayState,
  reduceReplayRecord,
  setReplayStatus,
  type ReplaySpeed,
  type ReplayState,
} from "@proof-play/replay";
import { useCallback, useEffect, useRef, useState } from "react";

const DEFAULT_FIXTURE_ID = "18241006";
const statLabels: Record<string, string> = {
  "1": "P1 goals",
  "2": "P2 goals",
  "3": "P1 yellow cards",
  "4": "P2 yellow cards",
  "5": "P1 red cards",
  "6": "P2 red cards",
  "7": "P1 corners",
  "8": "P2 corners",
};
const speeds: ReplaySpeed[] = [0.5, 1, 2, 4];

type ReplayMeta = {
  totalRecords: number;
  remainingRecords: number;
  targetDurationMs: number;
};

function scoreValue(value: number | null | undefined) {
  return value ?? "–";
}

function displayPhase(value: string | null, lifecycle: string) {
  if (!value) return lifecycle;
  return value.replaceAll("_", " ");
}

export type ReplayMatchProps = {
  fixtureId?: string;
  participantNames?: [string, string];
  conditionStatement?: string;
  initialSpeed?: ReplaySpeed;
  onComplete?: () => void;
  onError?: () => void;
};

export function ReplayMatch({
  fixtureId = DEFAULT_FIXTURE_ID,
  participantNames = ["Participant 1", "Participant 2"],
  conditionStatement = "Participant 2 wins and total corners are at most 7.",
  initialSpeed = 1,
  onComplete,
  onError,
}: ReplayMatchProps = {}) {
  const [state, setState] = useState<ReplayState>(() =>
    initialReplayState(fixtureId),
  );
  const [speed, setSpeed] = useState<ReplaySpeed>(initialSpeed);
  const [meta, setMeta] = useState<ReplayMeta | null>(null);
  const source = useRef<EventSource | null>(null);
  const latestState = useRef(state);
  const completionSent = useRef(false);

  useEffect(() => {
    latestState.current = state;
  }, [state]);

  const closeSource = useCallback(() => {
    source.current?.close();
    source.current = null;
  }, []);

  const connect = useCallback(
    (afterSequence: number) => {
      closeSource();
      setState((current) => setReplayStatus(current, "running"));
      const events = new EventSource(
        `/api/replay/${fixtureId}?speed=${speed}&afterSequence=${afterSequence}`,
      );
      source.current = events;
      events.addEventListener("replay-meta", (event) => {
        const nextMeta = JSON.parse((event as MessageEvent).data) as ReplayMeta;
        setMeta(nextMeta);
        setState((current) => ({
          ...current,
          totalRecords: nextMeta.totalRecords,
        }));
      });
      events.addEventListener("replay-score", (event) => {
        const record = JSON.parse(
          (event as MessageEvent).data,
        ) as MatchScoreRecord;
        setState((current) =>
          reduceReplayRecord(current, record, current.totalRecords),
        );
        if (record.isFinal && !completionSent.current) {
          completionSent.current = true;
          onComplete?.();
        }
      });
      events.addEventListener("replay-end", () => {
        setState((current) =>
          setReplayStatus(
            current,
            current.lifecycle === "finalized" ? "complete" : current.status,
          ),
        );
        closeSource();
      });
      events.addEventListener("replay-error", (event) => {
        const error = JSON.parse((event as MessageEvent).data) as {
          message?: string;
        };
        setState((current) =>
          setReplayStatus(
            current,
            "error",
            error.message ?? "Replay could not be loaded.",
          ),
        );
        onError?.();
        closeSource();
      });
      events.onerror = () => {
        if (
          source.current === events &&
          events.readyState === EventSource.CLOSED
        ) {
          setState((current) =>
            current.status === "complete"
              ? current
              : setReplayStatus(
                  current,
                  "error",
                  "Replay connection closed unexpectedly.",
                ),
          );
          onError?.();
        }
      };
    },
    [closeSource, fixtureId, onComplete, onError, speed],
  );

  useEffect(() => closeSource, [closeSource]);

  function startOrResume() {
    connect(latestState.current.currentSequence ?? 0);
  }

  function pause() {
    closeSource();
    setState((current) => setReplayStatus(current, "paused"));
  }

  function restart() {
    closeSource();
    setMeta(null);
    completionSent.current = false;
    setState(initialReplayState(fixtureId));
    connect(0);
  }

  function changeSpeed(nextSpeed: ReplaySpeed) {
    const wasRunning = latestState.current.status === "running";
    closeSource();
    setSpeed(nextSpeed);
    if (wasRunning) {
      setState((current) => setReplayStatus(current, "paused"));
    }
  }

  const score = state.score;
  const visibleStats = Object.entries(state.stats).filter(([key]) =>
    Object.hasOwn(statLabels, key),
  );
  const duration = meta
    ? Math.ceil(meta.targetDurationMs / (speed * 1_000))
    : null;

  return (
    <section className="replay-shell" aria-label="TxLINE deterministic replay">
      <div className="replay-toolbar">
        <div>
          <span className="eyebrow">Completed fixture</span>
          <label className="sr-only" htmlFor="fixture">
            Replay fixture
          </label>
          <select id="fixture" value={fixtureId} disabled>
            <option value={fixtureId}>Fixture {fixtureId}</option>
          </select>
        </div>
        <div className="replay-source">
          <span className="status-dot" aria-hidden="true" />
          REPLAY · TxLINE history · devnet
        </div>
      </div>

      <div className="scoreboard">
        <div className="scoreboard__participant">
          <span>{participantNames[0]}</span>
          <strong>{scoreValue(score?.participant1.goals)}</strong>
        </div>
        <div className="scoreboard__state">
          <span>{displayPhase(state.gameState, state.lifecycle)}</span>
          <small>
            {state.action ?? "Ready to replay"}
            {state.period !== null ? ` · period ${state.period}` : ""}
          </small>
        </div>
        <div className="scoreboard__participant scoreboard__participant--right">
          <span>{participantNames[1]}</span>
          <strong>{scoreValue(score?.participant2.goals)}</strong>
        </div>
      </div>

      <div className="replay-progress" aria-label="Replay progress">
        <div style={{ width: `${state.progress * 100}%` }} />
      </div>
      <div className="replay-progress__meta">
        <span>
          {state.processedRecords} / {state.totalRecords || "–"} events
        </span>
        <span>
          Seq {state.currentSequence ?? "–"}
          {duration ? ` · ~${duration}s remaining batch` : ""}
        </span>
      </div>

      <div className="replay-controls" aria-label="Replay controls">
        {state.status === "running" ? (
          <button type="button" onClick={pause}>
            Pause
          </button>
        ) : (
          <button
            type="button"
            onClick={startOrResume}
            disabled={state.status === "complete"}
          >
            {state.status === "paused" ? "Resume" : "Start replay"}
          </button>
        )}
        <button type="button" className="button-secondary" onClick={restart}>
          Restart
        </button>
        <div className="speed-control" aria-label="Replay speed">
          {speeds.map((candidate) => (
            <button
              type="button"
              className={candidate === speed ? "is-active" : ""}
              key={candidate}
              onClick={() => changeSpeed(candidate)}
              aria-pressed={candidate === speed}
            >
              {candidate}×
            </button>
          ))}
        </div>
      </div>

      {state.error ? <p className="error-banner">{state.error}</p> : null}

      <div className="replay-grid">
        <article className="replay-panel">
          <span className="eyebrow">Condition inputs</span>
          <h2>{conditionStatement}</h2>
          <p className="seeded-pool">
            Seeded demo pool · 4 YES / 6 NO demo tokens
          </p>
          <dl className="stat-grid">
            {visibleStats.length ? (
              visibleStats.map(([key, value]) => (
                <div key={key}>
                  <dt>{statLabels[key]}</dt>
                  <dd>{value}</dd>
                </div>
              ))
            ) : (
              <div>
                <dt>Waiting</dt>
                <dd>–</dd>
              </div>
            )}
          </dl>
        </article>
        <article className="replay-panel">
          <span className="eyebrow">Normalized event stream</span>
          <h2>Latest timeline</h2>
          <ol className="event-list">
            {state.timeline
              .slice(-6)
              .reverse()
              .map((item) => (
                <li key={item.sequence}>
                  <span>#{item.sequence}</span>
                  <strong>{item.action}</strong>
                  <small>
                    {displayPhase(item.gameState, item.lifecycle)}
                    {item.period !== null ? ` · period ${item.period}` : ""}
                  </small>
                </li>
              ))}
            {!state.timeline.length ? (
              <li>Start to load TxLINE history.</li>
            ) : null}
          </ol>
        </article>
      </div>
    </section>
  );
}
