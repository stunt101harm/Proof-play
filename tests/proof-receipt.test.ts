import {
  buildProofReceipt,
  receiptFromDevnetEvidence,
  type DevnetEvidence,
  type ProofReceiptInput,
} from "@proof-play/receipt";
import { describe, expect, it } from "vitest";
import evidenceJson from "../docs/evidence/proof-settlement-devnet-verification.json";

const evidence = evidenceJson as unknown as DevnetEvidence;

function verifiedInput(): ProofReceiptInput {
  return {
    status: "verified",
    statusMessage: "Verified",
    sourceMode: "historicalReplay",
    market: {
      poolAddress: evidence.pool.address,
      fixtureId: evidence.fixture.fixtureId,
      statement: evidence.condition.statement,
      legs: evidence.condition.legs,
      conditionCommitment: evidence.condition.conditionCommitmentHex,
      compilerVersion: evidence.condition.compilerVersion,
      statKeys: evidence.condition.statKeys,
    },
    result: {
      sequence: evidence.fixture.sequence,
      action: "game_finalised",
      statusId: 100,
      stats: evidence.proof.stats,
    },
    validation: {
      proofAccepted: true,
      predicateResult: true,
      txlineProgramId: evidence.txlineProgramId,
      dailyScoresRoot: evidence.proof.dailyScoresRoot,
      proofTimestampMs: evidence.proof.timestampMs,
      eventStatRoot: evidence.proof.eventStatRoot,
    },
    settlement: {
      proofPlayProgramId: evidence.programId,
      transactionSignature: evidence.pool.settleSignature,
      observedSequence: evidence.fixture.sequence,
      winningSide: "yes",
      poolState: "closed",
    },
    payout: {
      yesAmount: "4000000",
      noAmount: "6000000",
      userStake: "4000000",
      claimedAmount: "10000000",
      tokenDecimals: 6,
    },
  };
}

describe("Proof Receipt", () => {
  it("builds a real, explorer-linked receipt from devnet verification evidence", () => {
    const receipt = receiptFromDevnetEvidence(evidence);
    expect(receipt).toMatchObject({
      status: "verified",
      canPayout: true,
      settlement: { winningSide: "yes", observedSequence: 962 },
      payoutSummary: {
        winningPoolAmount: "4000000",
        totalPoolAmount: "10000000",
        calculatedClaimAmount: "10000000",
      },
    });
    expect(receipt.explorer.settlementTransaction).toContain(
      evidence.pool.settleSignature,
    );
    expect(receipt.explorer.pool).toContain(evidence.pool.address);
  });

  it("shows a verified NO winner when the final predicate is false", () => {
    const input = verifiedInput();
    input.validation!.predicateResult = false;
    input.settlement!.winningSide = "no";
    input.payout = {
      ...input.payout!,
      userStake: "3000000",
      claimedAmount: "5000000",
    };
    const receipt = buildProofReceipt(input);
    expect(receipt).toMatchObject({
      canPayout: true,
      settlement: { winningSide: "no" },
      payoutSummary: { calculatedClaimAmount: "5000000" },
    });
  });

  it("never presents a winner or payout for pending and failed states", () => {
    const input = verifiedInput();
    const pending: ProofReceiptInput = {
      ...input,
      status: "pending",
      statusMessage: "Awaiting final TxLINE record",
      validation: undefined,
      settlement: undefined,
      payout: undefined,
    };
    expect(buildProofReceipt(pending)).toMatchObject({
      status: "pending",
      canPayout: false,
      payoutSummary: null,
    });
    expect(() =>
      buildProofReceipt({
        ...pending,
        status: "failed",
        settlement: input.settlement,
      }),
    ).toThrow(/cannot present a payout winner/i);
  });

  it("rejects mismatched final inputs, proof bindings, and payout math", () => {
    const wrongSequence = verifiedInput();
    wrongSequence.settlement!.observedSequence += 1;
    expect(() => buildProofReceipt(wrongSequence)).toThrow(/binding/i);

    const wrongWinner = verifiedInput();
    wrongWinner.settlement!.winningSide = "no";
    expect(() => buildProofReceipt(wrongWinner)).toThrow(/winner/i);

    const wrongClaim = verifiedInput();
    wrongClaim.payout!.claimedAmount = "999";
    expect(() => buildProofReceipt(wrongClaim)).toThrow(/accounting/i);
  });
});
