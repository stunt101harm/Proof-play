"use client";

import {
  compileCondition,
  type CompiledConditionV1,
} from "@proof-play/condition-engine";
import { PublicKey, type Connection } from "@solana/web3.js";
import { useEffect, useMemo, useState } from "react";

import { useWallet, walletErrorMessage } from "@/components/wallet-provider";
import { poolActionAvailability } from "@/lib/pool-actions";
import {
  calculatePayout,
  decodeTokenMintDecimals,
  decodePoolAccount,
  decodePositionAccount,
  deriveAssociatedTokenAddress,
  derivePositionAddress,
  estimateOpenPoolPayout,
  explorerAddressUrl,
  explorerTransactionUrl,
  formatTokenAmount,
  joinPoolInstructions,
  parseTokenAmount,
  payoutInstruction,
  type PoolAccount,
  type PoolSide,
  type PositionAccount,
} from "@/lib/proof-play-program";
import { seededFixture } from "@/lib/demo-data";

const TXLINE_CREDIT_MINT = "4Zao8ocPhmMgq7PdsYWyxvqySMGx7xb9cMftPMkEokRG";

type PoolSnapshot = {
  pool: PoolAccount;
  position: PositionAccount | null;
  tokenDecimals: number;
  tokenBalance: bigint;
  tokenAccountExists: boolean;
  solBalance: number;
};

type TransactionPhase =
  "idle" | "awaitingSignature" | "confirming" | "confirmed" | "failed";

async function readPoolSnapshot(input: {
  connection: Connection;
  programId: PublicKey;
  poolAddress: PublicKey;
  owner: PublicKey | null;
}): Promise<PoolSnapshot> {
  const poolInfo = await input.connection.getAccountInfo(
    input.poolAddress,
    "confirmed",
  );
  if (!poolInfo)
    throw new Error("ProofPlay pool account was not found on devnet.");
  const pool = decodePoolAccount(input.poolAddress, poolInfo, input.programId);
  const mintInfo = await input.connection.getAccountInfo(
    pool.tokenMint,
    "confirmed",
  );
  if (!mintInfo)
    throw new Error("Pool collateral mint was not found on devnet.");
  const tokenDecimals = decodeTokenMintDecimals(mintInfo);
  if (!input.owner) {
    return {
      pool,
      position: null,
      tokenDecimals,
      tokenBalance: 0n,
      tokenAccountExists: false,
      solBalance: 0,
    };
  }

  const positionAddress = derivePositionAddress(
    input.programId,
    pool.address,
    input.owner,
  );
  const tokenAddress = deriveAssociatedTokenAddress(
    pool.tokenMint,
    input.owner,
  );
  const [positionInfo, tokenInfo, solBalance] = await Promise.all([
    input.connection.getAccountInfo(positionAddress, "confirmed"),
    input.connection.getAccountInfo(tokenAddress, "confirmed"),
    input.connection.getBalance(input.owner, "confirmed"),
  ]);
  const tokenBalance = tokenInfo
    ? BigInt(
        (
          await input.connection.getTokenAccountBalance(
            tokenAddress,
            "confirmed",
          )
        ).value.amount,
      )
    : 0n;
  return {
    pool,
    position: positionInfo
      ? decodePositionAccount(positionAddress, positionInfo, input.programId)
      : null,
    tokenDecimals,
    tokenBalance,
    tokenAccountExists: Boolean(tokenInfo),
    solBalance,
  };
}

function stateLabel(state: PoolAccount["state"]) {
  const labels: Record<PoolAccount["state"], string> = {
    open: "Open",
    locked: "Locked for settlement",
    settledYes: "Settled · YES won",
    settledNo: "Settled · NO won",
    cancelled: "Cancelled · refunds open",
    closed: "Closed",
  };
  return labels[state];
}

function transactionLabel(phase: TransactionPhase) {
  if (phase === "awaitingSignature") return "Approve in wallet";
  if (phase === "confirming") return "Confirming on devnet";
  if (phase === "confirmed") return "Confirmed";
  if (phase === "failed") return "Failed safely";
  return "Ready";
}

export function PoolExperience({
  poolAddress,
  fixtureIdHint,
  canonicalJson,
  creationTransaction,
}: {
  poolAddress: string;
  fixtureIdHint?: string;
  canonicalJson?: string;
  creationTransaction?: string;
}) {
  const wallet = useWallet();
  const [snapshot, setSnapshot] = useState<PoolSnapshot | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<CompiledConditionV1 | null>(null);
  const [metadataState, setMetadataState] = useState<
    "checking" | "verified" | "missing" | "mismatch"
  >("checking");
  const [selectedSide, setSelectedSide] = useState<PoolSide>("yes");
  const [amount, setAmount] = useState("1");
  const [transactionPhase, setTransactionPhase] =
    useState<TransactionPhase>("idle");
  const [transactionError, setTransactionError] = useState<string | null>(null);
  const [lastTransaction, setLastTransaction] = useState<string | null>(
    creationTransaction ?? null,
  );
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [currentUnixSeconds, setCurrentUnixSeconds] = useState(0);
  const [funding, setFunding] = useState<"idle" | "requesting" | "failed">(
    "idle",
  );

  const programId = useMemo(() => {
    try {
      return new PublicKey(wallet.config.proofPlayProgramId);
    } catch {
      return null;
    }
  }, [wallet.config.proofPlayProgramId]);
  const address = useMemo(() => {
    try {
      return new PublicKey(poolAddress);
    } catch {
      return null;
    }
  }, [poolAddress]);

  useEffect(() => {
    const timer = setTimeout(
      () => setCurrentUnixSeconds(Math.floor(Date.now() / 1_000)),
      0,
    );
    const interval = setInterval(
      () => setCurrentUnixSeconds(Math.floor(Date.now() / 1_000)),
      15_000,
    );
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!address || !programId) {
      const timer = setTimeout(() => {
        setLoadState("error");
        setLoadError("Pool or program address is invalid.");
      }, 0);
      return () => clearTimeout(timer);
    }
    let active = true;
    void readPoolSnapshot({
      connection: wallet.connection,
      programId,
      poolAddress: address,
      owner: wallet.publicKey,
    })
      .then((result) => {
        if (!active) return;
        setSnapshot(result);
        setLoadState("ready");
        setLoadError(null);
      })
      .catch((caught) => {
        if (!active) return;
        setSnapshot(null);
        setLoadState("error");
        setLoadError(walletErrorMessage(caught));
      });
    return () => {
      active = false;
    };
  }, [address, programId, refreshVersion, wallet.connection, wallet.publicKey]);

  useEffect(() => {
    if (!canonicalJson || !snapshot) {
      const timer = setTimeout(
        () => setMetadataState(canonicalJson ? "checking" : "missing"),
        0,
      );
      return () => clearTimeout(timer);
    }
    let active = true;
    try {
      const condition = JSON.parse(canonicalJson) as unknown;
      const fixture = fixtureIdHint ? seededFixture(fixtureIdHint) : undefined;
      void compileCondition(condition, {
        participantNames: fixture
          ? {
              1: fixture.participants[0].name,
              2: fixture.participants[1].name,
            }
          : undefined,
      })
        .then((compiled) => {
          if (!active) return;
          const verified =
            compiled.conditionCommitmentHex ===
              snapshot.pool.conditionCommitmentHex &&
            compiled.compilerVersion === snapshot.pool.compilerVersion &&
            BigInt(compiled.fixtureId) === snapshot.pool.fixtureId;
          setMetadata(verified ? compiled : null);
          setMetadataState(verified ? "verified" : "mismatch");
        })
        .catch(() => {
          if (!active) return;
          setMetadata(null);
          setMetadataState("mismatch");
        });
    } catch {
      const timer = setTimeout(() => {
        if (!active) return;
        setMetadata(null);
        setMetadataState("mismatch");
      }, 0);
      return () => {
        active = false;
        clearTimeout(timer);
      };
    }
    return () => {
      active = false;
    };
  }, [canonicalJson, fixtureIdHint, snapshot]);

  function refresh() {
    setLoadState("loading");
    setRefreshVersion((current) => current + 1);
  }

  async function submitTransaction(
    instructions: Parameters<typeof wallet.sendInstructions>[0],
  ) {
    setTransactionError(null);
    try {
      const signature = await wallet.sendInstructions(instructions, (phase) =>
        setTransactionPhase(phase),
      );
      setLastTransaction(signature);
      setTransactionPhase("confirmed");
      refresh();
    } catch (caught) {
      setTransactionError(walletErrorMessage(caught));
      setTransactionPhase("failed");
    }
  }

  if (loadState === "loading" && !snapshot) {
    return (
      <section className="pool-loading" aria-live="polite">
        <span className="status-dot" aria-hidden="true" />
        <strong>Reading the ProofPlay pool from Solana devnet…</strong>
      </section>
    );
  }

  if (loadState === "error" || !snapshot || !programId || !address) {
    return (
      <section className="pool-loading pool-loading--error" role="alert">
        <strong>Pool unavailable</strong>
        <span>{loadError ?? "This pool could not be decoded safely."}</span>
        <button type="button" onClick={refresh}>
          Retry devnet
        </button>
      </section>
    );
  }

  const { pool, position, tokenDecimals, tokenBalance, tokenAccountExists } =
    snapshot;
  const resolvedProgramId = programId;
  let configuredDemoMint = false;
  try {
    configuredDemoMint = pool.tokenMint.equals(
      new PublicKey(wallet.config.demoTokenMint),
    );
  } catch {
    configuredDemoMint = false;
  }
  const isTxlineCredit = pool.tokenMint.toBase58() === TXLINE_CREDIT_MINT;
  const collateralAccepted = configuredDemoMint && !isTxlineCredit;
  const availability = poolActionAvailability({
    pool,
    position,
    selectedSide,
    currentUnixSeconds,
    collateralAccepted,
    metadataVerified: metadataState === "verified",
  });
  let parsedAmount = 0n;
  let amountError: string | null = null;
  try {
    parsedAmount = parseTokenAmount(amount, tokenDecimals);
    if (parsedAmount > tokenBalance) {
      amountError = "Demo-token balance is lower than this deposit.";
    }
  } catch (caught) {
    amountError = walletErrorMessage(caught);
  }
  const estimatedPayout = estimateOpenPoolPayout({
    yesAmount: pool.yesAmount,
    noAmount: pool.noAmount,
    side: selectedSide,
    existingPositionAmount:
      position?.side === selectedSide ? position.amount : 0n,
    depositAmount: parsedAmount,
  });
  const settledPayout =
    availability.claim && position
      ? calculatePayout({
          remainingPoolAmount: pool.remainingPoolAmount,
          remainingWinningStake: pool.remainingWinningStake,
          positionAmount: position.amount,
        })
      : 0n;
  const transactionPending =
    transactionPhase === "awaitingSignature" ||
    transactionPhase === "confirming";
  const collateralUnitLabel = configuredDemoMint
    ? "demo tokens"
    : "token units";

  async function join() {
    if (!wallet.publicKey || !availability.join || amountError) return;
    const built = joinPoolInstructions({
      programId: resolvedProgramId,
      participant: wallet.publicKey,
      pool,
      side: selectedSide,
      amount: parsedAmount,
      participantTokenAccountExists: tokenAccountExists,
    });
    await submitTransaction(built.instructions);
  }

  async function claimOrRefund(action: "claim" | "refund") {
    if (!wallet.publicKey) return;
    if (action === "claim" && !availability.claim) return;
    if (action === "refund" && !availability.refund) return;
    const built = payoutInstruction({
      action,
      programId: resolvedProgramId,
      owner: wallet.publicKey,
      pool,
      destinationTokenAccountExists: tokenAccountExists,
    });
    await submitTransaction(built.instructions);
  }

  async function requestAirdrop() {
    setFunding("requesting");
    setTransactionError(null);
    try {
      const signature = await wallet.requestSolAirdrop();
      setLastTransaction(signature);
      setFunding("idle");
      refresh();
    } catch (caught) {
      setFunding("failed");
      setTransactionError(walletErrorMessage(caught));
    }
  }

  return (
    <section className="pool-experience">
      <div className="pool-status-strip">
        <div>
          <span className="status-dot" aria-hidden="true" />
          <strong>{stateLabel(pool.state)}</strong>
          <small>Solana devnet · on-chain state</small>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={loadState === "loading"}
        >
          {loadState === "loading" ? "Refreshing…" : "Refresh state"}
        </button>
      </div>

      <div className="pool-overview-grid">
        <article className="pool-contract-card">
          <span className="eyebrow">Verifiable condition</span>
          <h2>
            {metadata?.humanStatement ??
              "Readable condition metadata is not verified."}
          </h2>
          <div className="metadata-verification" data-state={metadataState}>
            <strong>
              {metadataState === "verified"
                ? "URL metadata matches the on-chain commitment"
                : metadataState === "checking"
                  ? "Checking condition commitment…"
                  : metadataState === "missing"
                    ? "No readable condition metadata was supplied"
                    : "Condition metadata does not match this pool"}
            </strong>
            <small>
              Compiler v{pool.compilerVersion} · commitment{" "}
              {pool.conditionCommitmentHex.slice(0, 12)}…
            </small>
          </div>
          {metadata ? (
            <ol className="condition-leg-summary">
              {metadata.compiledLegs.map((leg) => (
                <li key={leg.humanStatement}>{leg.humanStatement}</li>
              ))}
            </ol>
          ) : null}
        </article>

        <article className="pool-chain-card">
          <span className="eyebrow">Immutable pool accounts</span>
          <dl>
            <div>
              <dt>Fixture</dt>
              <dd>{pool.fixtureId.toString()}</dd>
            </div>
            <div>
              <dt>Cutoff</dt>
              <dd>
                {new Date(
                  Number(pool.cutoffUnixSeconds) * 1_000,
                ).toLocaleString("en", {
                  timeZone: "UTC",
                  timeZoneName: "short",
                })}
              </dd>
            </div>
            <div>
              <dt>Collateral</dt>
              <dd>
                {configuredDemoMint
                  ? "ProofPlay demo token"
                  : isTxlineCredit
                    ? "Blocked TxLINE credit mint"
                    : "External devnet SPL token · read only"}
              </dd>
            </div>
          </dl>
          <a
            href={explorerAddressUrl(pool.address)}
            target="_blank"
            rel="noreferrer"
          >
            Inspect pool account on Explorer ↗
          </a>
        </article>
      </div>

      <div className="pool-totals" aria-label="Pool side totals">
        <div data-side="yes">
          <span>YES pool</span>
          <strong>{formatTokenAmount(pool.yesAmount, tokenDecimals)}</strong>
          <small>{collateralUnitLabel}</small>
        </div>
        <div className="pool-totals__total">
          <span>Total escrowed</span>
          <strong>
            {formatTokenAmount(pool.yesAmount + pool.noAmount, tokenDecimals)}
          </strong>
          <small>zero protocol fee</small>
        </div>
        <div data-side="no">
          <span>NO pool</span>
          <strong>{formatTokenAmount(pool.noAmount, tokenDecimals)}</strong>
          <small>{collateralUnitLabel}</small>
        </div>
      </div>

      <div className="participation-grid">
        <article className="join-card">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Real devnet participation</span>
              <h2>Choose one side.</h2>
            </div>
            <span className="transaction-phase" data-phase={transactionPhase}>
              {transactionLabel(transactionPhase)}
            </span>
          </div>
          <div className="side-picker">
            {(["yes", "no"] as const).map((side) => (
              <button
                type="button"
                key={side}
                className={selectedSide === side ? "is-active" : ""}
                onClick={() => setSelectedSide(side)}
                disabled={Boolean(position && position.side !== side)}
                aria-pressed={selectedSide === side}
              >
                {side.toUpperCase()}
              </button>
            ))}
          </div>
          <label className="amount-field">
            <span>Demo-token deposit</span>
            <input
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              disabled={!availability.join}
            />
          </label>
          <dl className="join-estimate">
            <div>
              <dt>Wallet balance</dt>
              <dd>{formatTokenAmount(tokenBalance, tokenDecimals)}</dd>
            </div>
            <div>
              <dt>Position after deposit</dt>
              <dd>
                {formatTokenAmount(
                  (position?.side === selectedSide ? position.amount : 0n) +
                    (pool.state === "open" ? parsedAmount : 0n),
                  tokenDecimals,
                )}
              </dd>
            </div>
            <div>
              <dt>Estimated payout if {selectedSide.toUpperCase()} wins</dt>
              <dd>
                {pool.state === "open"
                  ? formatTokenAmount(estimatedPayout, tokenDecimals)
                  : "—"}
              </dd>
            </div>
          </dl>
          {amountError && availability.join ? (
            <p className="field-error" role="alert">
              {amountError}
            </p>
          ) : null}
          <p className="action-explanation">{availability.reason}</p>
          {availability.join ? (
            <button
              className="demo-primary"
              type="button"
              disabled={
                !wallet.publicKey || Boolean(amountError) || transactionPending
              }
              onClick={() => void join()}
            >
              Deposit {amount || "0"} on {selectedSide.toUpperCase()}
            </button>
          ) : null}
          {!wallet.publicKey ? (
            <small>
              Connect a wallet from the navigation bar to participate.
            </small>
          ) : null}
        </article>

        <article className="position-card">
          <span className="eyebrow">Your wallet position</span>
          {wallet.publicKey ? (
            <>
              <h2>
                {position
                  ? `${position.side.toUpperCase()} position`
                  : "No position yet"}
              </h2>
              <dl>
                <div>
                  <dt>Deposited</dt>
                  <dd>
                    {formatTokenAmount(position?.amount ?? 0n, tokenDecimals)}
                  </dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>
                    {position?.claimed
                      ? "Claimed"
                      : position?.refunded
                        ? "Refunded"
                        : position
                          ? "Active"
                          : "Not joined"}
                  </dd>
                </div>
                <div>
                  <dt>Claimable now</dt>
                  <dd>{formatTokenAmount(settledPayout, tokenDecimals)}</dd>
                </div>
              </dl>
              {availability.claim ? (
                <button
                  className="demo-primary"
                  type="button"
                  disabled={transactionPending}
                  onClick={() => void claimOrRefund("claim")}
                >
                  Claim {formatTokenAmount(settledPayout, tokenDecimals)} demo
                  tokens
                </button>
              ) : null}
              {availability.refund ? (
                <button
                  className="demo-primary"
                  type="button"
                  disabled={transactionPending}
                  onClick={() => void claimOrRefund("refund")}
                >
                  Refund{" "}
                  {formatTokenAmount(position?.amount ?? 0n, tokenDecimals)}{" "}
                  demo tokens
                </button>
              ) : null}
            </>
          ) : (
            <p>
              Connect a supported wallet to read its position PDA and valid
              actions.
            </p>
          )}
        </article>
      </div>

      <article className="funding-card">
        <div>
          <span className="eyebrow">Devnet funding</span>
          <h2>Fees use devnet SOL. Deposits use demo SPL tokens.</h2>
          <p>
            They are separate assets with no monetary value. ProofPlay never
            uses or presents TxLINE subscription credits as pool collateral.
          </p>
        </div>
        <dl>
          <div>
            <dt>Wallet SOL</dt>
            <dd>{(snapshot.solBalance / 1_000_000_000).toFixed(4)} SOL</dd>
          </div>
          <div>
            <dt>Demo token mint</dt>
            <dd>{pool.tokenMint.toBase58()}</dd>
          </div>
        </dl>
        <div className="funding-card__actions">
          <button
            type="button"
            disabled={!wallet.publicKey || funding === "requesting"}
            onClick={() => void requestAirdrop()}
          >
            {funding === "requesting" ? "Requesting…" : "Request 1 devnet SOL"}
          </button>
          <small>
            Demo tokens are issued by the project team to a connected wallet;
            mint authority is never exposed in the browser.
          </small>
        </div>
      </article>

      {transactionError ? (
        <div className="transaction-error" role="alert">
          <strong>Nothing changed on-chain</strong>
          <span>{transactionError}</span>
        </div>
      ) : null}
      {lastTransaction ? (
        <div className="transaction-success">
          <div>
            <strong>Latest devnet transaction</strong>
            <span>{lastTransaction}</span>
          </div>
          <a
            href={explorerTransactionUrl(lastTransaction)}
            target="_blank"
            rel="noreferrer"
          >
            Inspect on Solana Explorer ↗
          </a>
        </div>
      ) : null}
    </section>
  );
}
