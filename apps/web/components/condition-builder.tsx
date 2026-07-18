"use client";

import {
  CONDITION_LIMITS,
  ConditionCompilerError,
  compileCondition,
  type CompiledConditionV1,
  type TxlineValidationStrategy,
} from "@proof-play/condition-engine";
import type {
  ConditionLegV1,
  ParticipantPosition,
  ThresholdComparison,
} from "@proof-play/domain";
import { useEffect, useMemo, useState } from "react";

export type ConfirmedCondition = {
  statement: string;
  conditionCommitmentHex: string;
  compilerVersion: number;
  statKeys: number[];
  canonicalJson: string;
  strategy: TxlineValidationStrategy;
  title?: string;
  description?: string;
  cutoffUnixSeconds?: number;
};

export type ConditionBuilderProps = {
  fixtureId: string;
  participantNames: [string, string];
  mode?: "creator" | "demo";
  defaultCutoff?: string;
  onConfirm?: (condition: ConfirmedCondition) => void;
};

const templateLabels: Record<ConditionLegV1["kind"], string> = {
  participantWins: "Match winner",
  totalGoals: "Total goals",
  bothTeamsScore: "Both teams score",
  winningMargin: "Winning margin",
  totalCorners: "Total corners",
};

function defaultLeg(kind: ConditionLegV1["kind"]): ConditionLegV1 {
  switch (kind) {
    case "participantWins":
      return { kind, participant: 2 };
    case "totalGoals":
      return { kind, comparison: "atLeast", threshold: 3 };
    case "bothTeamsScore":
      return { kind };
    case "winningMargin":
      return { kind, participant: 2, threshold: 2 };
    case "totalCorners":
      return { kind, comparison: "atMost", threshold: 7 };
  }
}

function updateParticipant(
  leg: ConditionLegV1,
  participant: ParticipantPosition,
): ConditionLegV1 {
  if (leg.kind === "participantWins" || leg.kind === "winningMargin") {
    return { ...leg, participant };
  }
  return leg;
}

function updateComparison(
  leg: ConditionLegV1,
  comparison: ThresholdComparison,
): ConditionLegV1 {
  if (leg.kind === "totalGoals" || leg.kind === "totalCorners") {
    return { ...leg, comparison };
  }
  return leg;
}

function updateThreshold(leg: ConditionLegV1, threshold: number) {
  if (
    leg.kind === "totalGoals" ||
    leg.kind === "totalCorners" ||
    leg.kind === "winningMargin"
  ) {
    return { ...leg, threshold };
  }
  return leg;
}

function errorMessage(error: unknown) {
  if (error instanceof ConditionCompilerError) {
    return `${error.code.replaceAll("_", " ")}: ${error.message}`;
  }
  return "This condition could not be compiled safely.";
}

export function ConditionBuilder({
  fixtureId,
  participantNames,
  mode = "creator",
  defaultCutoff = "",
  onConfirm,
}: ConditionBuilderProps) {
  const [legs, setLegs] = useState<ConditionLegV1[]>([
    { kind: "participantWins", participant: 2 },
    { kind: "totalCorners", comparison: "atMost", threshold: 7 },
  ]);
  const [compiled, setCompiled] = useState<CompiledConditionV1 | null>(null);
  const [compileError, setCompileError] = useState<string | null>(null);
  const [title, setTitle] = useState("Final whistle challenge");
  const [description, setDescription] = useState(
    "Back the complete two-leg condition with demo tokens.",
  );
  const [cutoff, setCutoff] = useState(defaultCutoff);
  const [formError, setFormError] = useState<string | null>(null);

  const condition = useMemo(
    () => ({ version: 1, fixtureId, operator: "all", legs }),
    [fixtureId, legs],
  );

  useEffect(() => {
    let active = true;
    void compileCondition(condition, {
      participantNames: {
        1: participantNames[0],
        2: participantNames[1],
      },
    })
      .then((result) => {
        if (!active) return;
        setCompiled(result);
        setCompileError(null);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setCompiled(null);
        setCompileError(errorMessage(error));
      });
    return () => {
      active = false;
    };
  }, [condition, participantNames]);

  function replaceLeg(index: number, leg: ConditionLegV1) {
    setFormError(null);
    setLegs((current) =>
      current.map((candidate, candidateIndex) =>
        candidateIndex === index ? leg : candidate,
      ),
    );
  }

  function confirm() {
    if (!compiled) return;
    const cutoffUnixSeconds = Math.floor(Date.parse(`${cutoff}Z`) / 1_000);
    if (mode === "creator") {
      if (!title.trim()) {
        setFormError("Enter a pool title before reviewing the transaction.");
        return;
      }
      if (
        !Number.isSafeInteger(cutoffUnixSeconds) ||
        cutoffUnixSeconds <= Math.floor(Date.now() / 1_000) + 60
      ) {
        setFormError(
          "Deposit cutoff must be at least one minute in the future.",
        );
        return;
      }
    }
    const confirmed: ConfirmedCondition = {
      statement: compiled.humanStatement,
      conditionCommitmentHex: compiled.conditionCommitmentHex,
      compilerVersion: compiled.compilerVersion,
      statKeys: compiled.statKeys,
      canonicalJson: compiled.canonicalJson,
      strategy: compiled.strategy,
      ...(mode === "creator"
        ? {
            title: title.trim(),
            description: description.trim(),
            cutoffUnixSeconds,
          }
        : {}),
    };
    setFormError(null);
    onConfirm?.(confirmed);
  }

  return (
    <section
      className="builder-shell"
      aria-label="Prediction condition builder"
    >
      <div className="builder-main">
        <div className="builder-heading">
          <div>
            <span className="eyebrow">No-code condition</span>
            <h2>Say what must happen.</h2>
          </div>
          <span className="builder-count">
            {legs.length}/{CONDITION_LIMITS.maxLegs} legs
          </span>
        </div>

        {mode === "creator" ? (
          <div className="pool-details">
            <label>
              <span>Pool title</span>
              <input
                value={title}
                onChange={(event) => {
                  setTitle(event.target.value);
                  setFormError(null);
                }}
                maxLength={60}
              />
            </label>
            <label>
              <span>Deposit cutoff · UTC</span>
              <input
                type="datetime-local"
                value={cutoff}
                onFocus={() => {
                  if (!cutoff) {
                    setFormError(null);
                    setCutoff(
                      new Date(Date.now() + 60 * 60 * 1_000)
                        .toISOString()
                        .slice(0, 16),
                    );
                  }
                }}
                onChange={(event) => {
                  setCutoff(event.target.value);
                  setFormError(null);
                }}
              />
            </label>
            <label className="pool-details__description">
              <span>Description · optional</span>
              <textarea
                value={description}
                onChange={(event) => {
                  setDescription(event.target.value);
                  setFormError(null);
                }}
                maxLength={180}
              />
            </label>
          </div>
        ) : null}

        <div className="leg-list">
          {legs.map((leg, index) => (
            <article className="leg-editor" key={`${index}-${leg.kind}`}>
              <div className="leg-editor__number">0{index + 1}</div>
              <label>
                <span>Condition type</span>
                <select
                  value={leg.kind}
                  onChange={(event) =>
                    replaceLeg(
                      index,
                      defaultLeg(event.target.value as ConditionLegV1["kind"]),
                    )
                  }
                >
                  {Object.entries(templateLabels).map(([kind, label]) => (
                    <option key={kind} value={kind}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>

              {leg.kind === "participantWins" ||
              leg.kind === "winningMargin" ? (
                <label>
                  <span>Participant</span>
                  <select
                    value={leg.participant}
                    onChange={(event) =>
                      replaceLeg(
                        index,
                        updateParticipant(
                          leg,
                          Number(event.target.value) as ParticipantPosition,
                        ),
                      )
                    }
                  >
                    <option value={1}>{participantNames[0]}</option>
                    <option value={2}>{participantNames[1]}</option>
                  </select>
                </label>
              ) : null}

              {leg.kind === "totalGoals" || leg.kind === "totalCorners" ? (
                <label>
                  <span>Comparison</span>
                  <select
                    value={leg.comparison}
                    onChange={(event) =>
                      replaceLeg(
                        index,
                        updateComparison(
                          leg,
                          event.target.value as ThresholdComparison,
                        ),
                      )
                    }
                  >
                    <option value="atLeast">At least</option>
                    <option value="atMost">At most</option>
                  </select>
                </label>
              ) : null}

              {leg.kind === "totalGoals" ||
              leg.kind === "totalCorners" ||
              leg.kind === "winningMargin" ? (
                <label>
                  <span>Threshold</span>
                  <input
                    type="number"
                    min={leg.kind === "winningMargin" ? 1 : 0}
                    max={
                      leg.kind === "totalCorners"
                        ? CONDITION_LIMITS.maxCornerThreshold
                        : leg.kind === "totalGoals"
                          ? CONDITION_LIMITS.maxGoalThreshold
                          : CONDITION_LIMITS.maxWinningMargin
                    }
                    value={leg.threshold}
                    onChange={(event) =>
                      replaceLeg(
                        index,
                        updateThreshold(leg, Number(event.target.value)),
                      )
                    }
                  />
                </label>
              ) : null}

              {legs.length > 1 ? (
                <button
                  className="leg-editor__remove"
                  type="button"
                  onClick={() => {
                    setFormError(null);
                    setLegs((current) =>
                      current.filter(
                        (_, candidateIndex) => candidateIndex !== index,
                      ),
                    );
                  }}
                >
                  Remove
                </button>
              ) : null}
            </article>
          ))}
        </div>

        {legs.length < CONDITION_LIMITS.maxLegs ? (
          <button
            className="add-leg"
            type="button"
            onClick={() => {
              setFormError(null);
              setLegs((current) => [...current, defaultLeg("totalCorners")]);
            }}
          >
            + Add an AND condition
          </button>
        ) : null}
      </div>

      <aside className="builder-preview" aria-live="polite">
        <span className="eyebrow">Settlement preview</span>
        {compiled ? (
          <>
            <h2>{compiled.humanStatement}</h2>
            <div className="compile-path">
              <div>
                <span>Human contract</span>
                <strong>{compiled.compiledLegs.length} readable legs</strong>
              </div>
              <div>
                <span>TxLINE inputs</span>
                <strong>Keys {compiled.statKeys.join(", ")}</strong>
              </div>
              <div>
                <span>On-chain method</span>
                <strong>{compiled.validationMethod}</strong>
              </div>
            </div>
            <details>
              <summary>How this settles</summary>
              <p>
                Compiler v{compiled.compilerVersion} orders the stat keys and
                commits the canonical condition before any deposit. Settlement
                must use the exact stored strategy and final-period proof.
              </p>
              <code>{compiled.conditionCommitmentHex}</code>
              <pre>{JSON.stringify(compiled.strategy, null, 2)}</pre>
            </details>
            <button className="builder-confirm" type="button" onClick={confirm}>
              {mode === "demo"
                ? "Use this condition"
                : "Review devnet transaction"}
            </button>
            {mode === "creator" ? (
              <small className="builder-disclaimer">
                The next step estimates the fee and asks the connected wallet to
                create a real devnet pool. Demo tokens have no monetary value.
              </small>
            ) : null}
          </>
        ) : (
          <div className="compile-error" role="alert">
            <strong>Condition cannot be submitted</strong>
            <p>{compileError ?? "Compiling the current condition…"}</p>
          </div>
        )}
        {formError ? (
          <div className="compile-error" role="alert">
            <strong>Pool details need attention</strong>
            <p>{formError}</p>
          </div>
        ) : null}
      </aside>
    </section>
  );
}
