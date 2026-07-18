"use client";

import Link from "next/link";
import { useReducer, useState, useSyncExternalStore } from "react";

import {
  ConditionBuilder,
  type ConfirmedCondition,
} from "@/components/condition-builder";
import { ReplayMatch } from "@/components/replay-match";
import { DEMO_FIXTURE, DEMO_POOL } from "@/lib/demo-data";
import {
  initialDemoState,
  reduceDemoState,
  type DemoStage,
} from "@/lib/demo-state";

const stages: Array<{ id: DemoStage; label: string }> = [
  { id: "select", label: "Match" },
  { id: "build", label: "Condition" },
  { id: "join", label: "Join" },
  { id: "replay", label: "Replay" },
  { id: "settlement", label: "Receipt" },
];

const participantNames: [string, string] = [
  DEMO_FIXTURE.participants[0].name,
  DEMO_FIXTURE.participants[1].name,
];

function stageIndex(stage: DemoStage) {
  return stages.findIndex((candidate) => candidate.id === stage);
}

function subscribeToHydration() {
  return () => undefined;
}

function getClientHydrationSnapshot() {
  return true;
}

function getServerHydrationSnapshot() {
  return false;
}

export function JudgeDemo() {
  const [state, dispatch] = useReducer(reduceDemoState, undefined, () =>
    initialDemoState(),
  );
  const [condition, setCondition] = useState<ConfirmedCondition | null>(null);
  const [side, setSide] = useState<"yes" | "no">("yes");
  const [replayUnavailable, setReplayUnavailable] = useState(false);
  const isInteractive = useSyncExternalStore(
    subscribeToHydration,
    getClientHydrationSnapshot,
    getServerHydrationSnapshot,
  );
  const activeIndex = stageIndex(state.stage);

  function reset() {
    dispatch({ type: "reset" });
    setCondition(null);
    setSide("yes");
    setReplayUnavailable(false);
  }

  return (
    <section
      className="demo-shell"
      aria-label="Zero-setup ProofPlay Judge Demo"
    >
      <header className="demo-topbar">
        <div>
          <span className="eyebrow">
            Wallet-free · deterministic · under 4 minutes
          </span>
          <strong>Judge Demo</strong>
        </div>
        <div>
          {state.stage !== "select" ? (
            <button type="button" onClick={() => dispatch({ type: "back" })}>
              Back
            </button>
          ) : null}
          <button type="button" onClick={reset}>
            Reset demo
          </button>
        </div>
      </header>

      <ol className="demo-progress" aria-label="Demo progress">
        {stages.map((stage, index) => (
          <li
            key={stage.id}
            className={
              index === activeIndex
                ? "is-active"
                : index < activeIndex
                  ? "is-complete"
                  : ""
            }
            aria-current={index === activeIndex ? "step" : undefined}
          >
            <span>{index < activeIndex ? "✓" : `0${index + 1}`}</span>
            {stage.label}
          </li>
        ))}
      </ol>

      <div className="demo-callout">
        <strong>Where TxLINE is used</strong>
        <span>
          {state.stage === "select"
            ? "Fixture coverage and normalized participant metadata."
            : state.stage === "build"
              ? "The compiler maps readable legs to exact stat keys and validateStatV3 predicates."
              : state.stage === "join"
                ? "The pool commits the fixture and compiled condition before deposits close."
                : state.stage === "replay"
                  ? "Ordered historical score records drive the same reducer as live SSE."
                  : "The final V3 proof is validated on Solana before the winner is recorded."}
        </span>
      </div>

      {state.stage === "select" ? (
        <div className="demo-stage demo-select">
          <div className="demo-stage__intro">
            <span className="eyebrow">Step 01 · Select a verified match</span>
            <h2>Start with a covered TxLINE fixture.</h2>
            <p>
              This completed match has ordered historical events, an exact final
              proof, and a real devnet settlement ready for inspection.
            </p>
          </div>
          <button
            className="demo-match-card"
            type="button"
            disabled={!isInteractive}
            onClick={() =>
              dispatch({
                type: "selectFixture",
                fixtureId: DEMO_FIXTURE.fixtureId,
              })
            }
          >
            <span className="demo-match-card__meta">
              Final · Proof verified · Fixture {DEMO_FIXTURE.fixtureId}
            </span>
            <span className="demo-match-card__teams">
              <strong>{participantNames[0]}</strong>
              <small>1</small>
              <span>—</span>
              <small>2</small>
              <strong>{participantNames[1]}</strong>
            </span>
            <span className="demo-match-card__action">Use this fixture →</span>
          </button>
        </div>
      ) : null}

      {state.stage === "build" ? (
        <div className="demo-stage">
          <div className="demo-stage__intro demo-stage__intro--inline">
            <div>
              <span className="eyebrow">Step 02 · Build the condition</span>
              <h2>Readable for fans. Deterministic underneath.</h2>
            </div>
            <p>
              Try another supported combination—the compiler blocks duplicates,
              contradictions, unsupported fields, and unsafe bounds immediately.
            </p>
          </div>
          <ConditionBuilder
            fixtureId={DEMO_FIXTURE.fixtureId}
            participantNames={participantNames}
            mode="demo"
            onConfirm={(confirmed) => {
              setCondition(confirmed);
              dispatch({
                type: "compileCondition",
                conditionCommitment: confirmed.conditionCommitmentHex,
              });
            }}
          />
        </div>
      ) : null}

      {state.stage === "join" ? (
        <div className="demo-stage demo-join">
          <div className="demo-stage__intro">
            <span className="eyebrow">Step 03 · Join the seeded pool</span>
            <h2>{condition?.statement ?? DEMO_POOL.statement}</h2>
            <p>
              This interaction is explicitly simulated for judging. The linked
              program evidence uses a dedicated devnet demo token; no wallet,
              fee, or real-value asset is involved here.
            </p>
          </div>
          <div className="demo-pool-card">
            <div className="demo-label">SIMULATED PARTICIPATION</div>
            <div className="pool-split pool-split--large">
              <button
                type="button"
                className={side === "yes" ? "is-active" : ""}
                onClick={() => setSide("yes")}
                aria-pressed={side === "yes"}
              >
                <span>YES</span>
                <strong>{DEMO_POOL.yesSeedAmount}</strong>
                <small>seeded tokens</small>
              </button>
              <button
                type="button"
                className={side === "no" ? "is-active" : ""}
                onClick={() => setSide("no")}
                aria-pressed={side === "no"}
              >
                <span>NO</span>
                <strong>{DEMO_POOL.noSeedAmount}</strong>
                <small>seeded tokens</small>
              </button>
            </div>
            <dl className="join-summary">
              <div>
                <dt>Your side</dt>
                <dd>{side.toUpperCase()}</dd>
              </div>
              <div>
                <dt>Your demo stake</dt>
                <dd>{DEMO_POOL.joinAmount} token</dd>
              </div>
              <div>
                <dt>Network action</dt>
                <dd>None · simulated</dd>
              </div>
            </dl>
            {side === "no" ? (
              <p className="demo-warning">
                The linked canonical receipt follows the seeded YES golden path.
                Choose YES to continue to that exact evidence.
              </p>
            ) : null}
            <button
              className="demo-primary"
              type="button"
              disabled={side !== "yes"}
              onClick={() =>
                dispatch({
                  type: "joinPool",
                  side,
                  amount: DEMO_POOL.joinAmount,
                })
              }
            >
              Join YES with 1 demo token
            </button>
          </div>
        </div>
      ) : null}

      {state.stage === "replay" ? (
        <div className="demo-stage">
          <div className="demo-stage__intro demo-stage__intro--inline">
            <div>
              <span className="eyebrow">Step 04 · Replay the match</span>
              <h2>Watch 964 normalized events reach finality.</h2>
            </div>
            <p>
              Start at 4× to finish in about 19 seconds. Pause, resume, or
              restart without changing event order or final evidence.
            </p>
          </div>
          <ReplayMatch
            key={state.resetVersion}
            fixtureId={DEMO_FIXTURE.fixtureId}
            participantNames={participantNames}
            conditionStatement={condition?.statement ?? DEMO_POOL.statement}
            initialSpeed={4}
            onComplete={() => dispatch({ type: "completeReplay" })}
            onError={() => setReplayUnavailable(true)}
          />
          <div className="demo-replay-next">
            {state.replayComplete ? (
              <div>
                <strong>
                  Final record observed · sequence{" "}
                  {DEMO_POOL.settlementSequence}
                </strong>
                <span>The keeper may now fetch the exact final proof.</span>
              </div>
            ) : replayUnavailable ? (
              <div>
                <strong>
                  Historical endpoint unavailable in this browser.
                </strong>
                <span>
                  Use the checked devnet final state to keep the demo reliable.
                </span>
              </div>
            ) : (
              <div>
                <strong>Settlement remains locked.</strong>
                <span>Run the replay until `game_finalised` is observed.</span>
              </div>
            )}
            {replayUnavailable && !state.replayComplete ? (
              <button
                type="button"
                onClick={() => dispatch({ type: "completeReplay" })}
              >
                Use verified final state
              </button>
            ) : null}
            <button
              className="demo-primary"
              type="button"
              disabled={!state.replayComplete}
              onClick={() => dispatch({ type: "openSettlement" })}
            >
              Inspect settlement
            </button>
          </div>
        </div>
      ) : null}

      {state.stage === "settlement" ? (
        <div className="demo-stage demo-settlement">
          <div className="demo-stage__intro">
            <span className="eyebrow">Step 05 · Verify settlement</span>
            <h2>Every hop is inspectable.</h2>
            <p>
              This screen replays checked evidence from the already-completed
              devnet transaction. It does not pretend to submit a new
              settlement.
            </p>
          </div>
          <ol className="settlement-path">
            <li>
              <span>01</span>
              <div>
                <strong>Final record observed</strong>
                <small>game_finalised · status 100 · seq 962</small>
              </div>
              <b>✓</b>
            </li>
            <li>
              <span>02</span>
              <div>
                <strong>Exact TxLINE V3 proof</strong>
                <small>Fixture, sequence, keys 1, 2, 7, 8 · period 100</small>
              </div>
              <b>✓</b>
            </li>
            <li>
              <span>03</span>
              <div>
                <strong>ProofPlay program confirmed</strong>
                <small>Predicate TRUE · winning side YES</small>
              </div>
              <b>✓</b>
            </li>
            <li>
              <span>04</span>
              <div>
                <strong>Winner claimed pro rata</strong>
                <small>4 YES / 6 NO · 10 demo tokens paid</small>
              </div>
              <b>✓</b>
            </li>
          </ol>
          <div className="demo-receipt-card">
            <div>
              <span className="eyebrow">Verified Proof Receipt</span>
              <h3>{condition?.statement ?? DEMO_POOL.statement}</h3>
              <p>
                Final score {DEMO_POOL.participant1FinalScore}–
                {DEMO_POOL.participant2FinalScore} · corners{" "}
                {DEMO_POOL.participant1FinalCorners}–
                {DEMO_POOL.participant2FinalCorners}
              </p>
            </div>
            <div
              className="verified-seal"
              aria-label="Verified on Solana devnet"
            >
              <span>✓</span>
              <strong>Verified</strong>
              <small>Solana devnet</small>
            </div>
          </div>
          <div className="demo-finish-actions">
            <Link href="/receipt">Open the complete Proof Receipt</Link>
            <a
              href={`https://explorer.solana.com/tx/${DEMO_POOL.settlementTransaction}?cluster=devnet`}
            >
              Inspect settlement on Solana ↗
            </a>
            <button type="button" onClick={reset}>
              Run the demo again
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
