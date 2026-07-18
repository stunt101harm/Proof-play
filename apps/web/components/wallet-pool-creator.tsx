"use client";

import { PublicKey } from "@solana/web3.js";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  ConditionBuilder,
  type ConfirmedCondition,
} from "@/components/condition-builder";
import { useWallet, walletErrorMessage } from "@/components/wallet-provider";
import { poolHref } from "@/lib/pool-metadata";
import {
  createPoolInstruction,
  explorerAddressUrl,
  TOKEN_PROGRAM_ID,
} from "@/lib/proof-play-program";

type PreparedPool = {
  poolId: bigint;
  poolAddress: PublicKey;
  instruction: ReturnType<typeof createPoolInstruction>["instruction"];
  feeLamports: number;
};

type TransactionPhase =
  | "idle"
  | "preparing"
  | "ready"
  | "awaitingSignature"
  | "confirming"
  | "failed";

function phaseLabel(phase: TransactionPhase) {
  switch (phase) {
    case "preparing":
      return "Checking program accounts and estimating fee…";
    case "ready":
      return "Ready for wallet signature";
    case "awaitingSignature":
      return "Approve the transaction in your wallet";
    case "confirming":
      return "Signed · confirming on Solana devnet…";
    case "failed":
      return "Transaction needs attention";
    default:
      return "Not prepared";
  }
}

export function WalletPoolCreator({
  fixtureId,
  participantNames,
}: {
  fixtureId: string;
  participantNames: [string, string];
}) {
  const router = useRouter();
  const wallet = useWallet();
  const [draft, setDraft] = useState<ConfirmedCondition | null>(null);
  const [prepared, setPrepared] = useState<PreparedPool | null>(null);
  const [phase, setPhase] = useState<TransactionPhase>("idle");
  const [error, setError] = useState<string | null>(null);

  async function prepare(condition = draft) {
    if (!condition?.cutoffUnixSeconds || !condition.title) return;
    if (!wallet.publicKey) {
      setError("Connect a supported wallet from the navigation bar first.");
      return;
    }
    setPhase("preparing");
    setError(null);
    setPrepared(null);
    try {
      if (wallet.networkState !== "devnet") {
        throw new Error("ProofPlay pool creation requires Solana devnet.");
      }
      if (condition.cutoffUnixSeconds <= Math.floor(Date.now() / 1_000) + 30) {
        throw new Error("Deposit cutoff expired; choose a later UTC cutoff.");
      }
      const programId = new PublicKey(wallet.config.proofPlayProgramId);
      const tokenMint = new PublicKey(wallet.config.demoTokenMint);
      const [programAccount, mintAccount] = await Promise.all([
        wallet.connection.getAccountInfo(programId, "confirmed"),
        wallet.connection.getAccountInfo(tokenMint, "confirmed"),
      ]);
      if (!programAccount?.executable) {
        throw new Error(
          "The configured ProofPlay devnet program is unavailable.",
        );
      }
      if (!mintAccount || !mintAccount.owner.equals(TOKEN_PROGRAM_ID)) {
        throw new Error(
          "The configured demo-token mint is unavailable on devnet.",
        );
      }

      let poolId = BigInt(Date.now());
      let addressAvailable = false;
      let built = createPoolInstruction({
        programId,
        creator: wallet.publicKey,
        tokenMint,
        poolId,
        fixtureId: BigInt(fixtureId),
        conditionCommitmentHex: condition.conditionCommitmentHex,
        compilerVersion: condition.compilerVersion,
        cutoffUnixSeconds: BigInt(condition.cutoffUnixSeconds),
        refundAfterUnixSeconds: BigInt(condition.cutoffUnixSeconds + 3_600),
        statKeys: condition.statKeys,
        strategy: condition.strategy,
      });
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const existing = await wallet.connection.getAccountInfo(
          built.pool,
          "confirmed",
        );
        if (!existing) {
          addressAvailable = true;
          break;
        }
        poolId += 1n;
        built = createPoolInstruction({
          programId,
          creator: wallet.publicKey,
          tokenMint,
          poolId,
          fixtureId: BigInt(fixtureId),
          conditionCommitmentHex: condition.conditionCommitmentHex,
          compilerVersion: condition.compilerVersion,
          cutoffUnixSeconds: BigInt(condition.cutoffUnixSeconds),
          refundAfterUnixSeconds: BigInt(condition.cutoffUnixSeconds + 3_600),
          statKeys: condition.statKeys,
          strategy: condition.strategy,
        });
      }
      if (!addressAvailable) {
        throw new Error(
          "Could not reserve a unique pool address. Please retry.",
        );
      }
      const feeLamports = await wallet.estimateInstructions([
        built.instruction,
      ]);
      setPrepared({
        poolId,
        poolAddress: built.pool,
        instruction: built.instruction,
        feeLamports,
      });
      setPhase("ready");
    } catch (caught) {
      setError(walletErrorMessage(caught));
      setPhase("failed");
    }
  }

  async function create() {
    if (!draft?.cutoffUnixSeconds || !draft.title || !prepared) return;
    if (draft.cutoffUnixSeconds <= Math.floor(Date.now() / 1_000) + 15) {
      setPrepared(null);
      setPhase("failed");
      setError("Deposit cutoff expired while reviewing; choose a later time.");
      return;
    }
    setError(null);
    try {
      const signature = await wallet.sendInstructions(
        [prepared.instruction],
        (next) => setPhase(next),
      );
      router.push(
        poolHref(prepared.poolAddress.toBase58(), {
          fixtureId,
          canonicalJson: draft.canonicalJson,
          title: draft.title,
          description: draft.description,
          transactionSignature: signature,
        }),
      );
    } catch (caught) {
      setError(walletErrorMessage(caught));
      setPhase("failed");
    }
  }

  return (
    <>
      <ConditionBuilder
        fixtureId={fixtureId}
        participantNames={participantNames}
        onConfirm={(condition) => {
          setDraft(condition);
          setPrepared(null);
          setPhase("idle");
          setError(null);
        }}
      />

      {draft ? (
        <section className="transaction-review" aria-live="polite">
          <div className="transaction-review__heading">
            <div>
              <span className="eyebrow">Wallet mode · real devnet action</span>
              <h2>Review the immutable pool contract.</h2>
            </div>
            <span className="transaction-phase" data-phase={phase}>
              {phaseLabel(phase)}
            </span>
          </div>
          <div className="transaction-review__grid">
            <dl>
              <div>
                <dt>Pool</dt>
                <dd>{draft.title}</dd>
              </div>
              <div>
                <dt>Condition</dt>
                <dd>{draft.statement}</dd>
              </div>
              <div>
                <dt>Deposit cutoff</dt>
                <dd>
                  {new Date(draft.cutoffUnixSeconds! * 1_000).toLocaleString(
                    "en",
                    { timeZone: "UTC", timeZoneName: "short" },
                  )}
                </dd>
              </div>
              <div>
                <dt>Collateral</dt>
                <dd>Dedicated ProofPlay demo SPL token · no monetary value</dd>
              </div>
              <div>
                <dt>Wallet</dt>
                <dd>
                  {wallet.publicKey
                    ? wallet.publicKey.toBase58()
                    : "Not connected"}
                </dd>
              </div>
              <div>
                <dt>Network fee</dt>
                <dd>
                  {prepared
                    ? `≈ ${(prepared.feeLamports / 1_000_000_000).toFixed(6)} SOL + account rent`
                    : "Estimate required before signing"}
                </dd>
              </div>
            </dl>
            <div className="transaction-review__commitment">
              <span>Condition commitment</span>
              <code>{draft.conditionCommitmentHex}</code>
              <small>
                Compiler v{draft.compilerVersion} · keys{" "}
                {draft.statKeys.join(", ")}
              </small>
              {prepared ? (
                <a
                  href={explorerAddressUrl(prepared.poolAddress)}
                  target="_blank"
                  rel="noreferrer"
                >
                  Preview pool address on Explorer ↗
                </a>
              ) : null}
            </div>
          </div>
          {error ? (
            <div className="transaction-error" role="alert">
              <strong>Transaction not submitted</strong>
              <span>{error}</span>
            </div>
          ) : null}
          <div className="transaction-review__actions">
            <button
              type="button"
              className="button-secondary"
              disabled={phase === "preparing" || phase === "confirming"}
              onClick={() => void prepare()}
            >
              {prepared ? "Re-estimate transaction" : "Estimate transaction"}
            </button>
            <button
              type="button"
              className="demo-primary"
              disabled={phase !== "ready" || !prepared}
              onClick={() => void create()}
            >
              Create pool on devnet
            </button>
          </div>
        </section>
      ) : null}
    </>
  );
}
