import type { DataSourceMode, PoolSide } from "@proof-play/domain";

export type ReceiptStatus = "verified" | "pending" | "failed";

export type ReceiptStat = {
  key: number;
  value: number;
  period: number;
};

export type ProofReceiptInput = {
  status: ReceiptStatus;
  statusMessage: string;
  sourceMode: DataSourceMode;
  market: {
    poolAddress: string;
    fixtureId: string;
    statement: string;
    legs: string[];
    conditionCommitment: string;
    compilerVersion: number;
    statKeys: number[];
  };
  result?: {
    sequence: number;
    action: string;
    statusId: number | null;
    stats: ReceiptStat[];
  };
  validation?: {
    proofAccepted: boolean;
    predicateResult: boolean | null;
    txlineProgramId: string;
    dailyScoresRoot: string;
    proofTimestampMs: number;
    eventStatRoot: string;
  };
  settlement?: {
    proofPlayProgramId: string;
    transactionSignature: string;
    observedSequence: number;
    winningSide: PoolSide | null;
    poolState: string;
  };
  payout?: {
    yesAmount: string;
    noAmount: string;
    userStake?: string;
    claimedAmount?: string;
    tokenDecimals: number;
  };
};

export type ProofReceipt = ProofReceiptInput & {
  canPayout: boolean;
  explorer: {
    pool: string;
    proofPlayProgram: string | null;
    txlineProgram: string | null;
    settlementTransaction: string | null;
    dailyScoresRoot: string | null;
  };
  payoutSummary: {
    winningPoolAmount: string;
    totalPoolAmount: string;
    formula: string;
    calculatedClaimAmount: string | null;
  } | null;
};

function solanaAddressUrl(address: string) {
  return `https://explorer.solana.com/address/${address}?cluster=devnet`;
}

function solanaTransactionUrl(signature: string) {
  return `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
}

function decimalAmount(value: string, label: string) {
  if (!/^(0|[1-9]\d*)$/.test(value)) {
    throw new Error(`${label} must be an unsigned decimal integer string.`);
  }
  return BigInt(value);
}

function validateMarket(input: ProofReceiptInput) {
  if (!/^[1-9]\d*$/.test(input.market.fixtureId)) {
    throw new Error("Receipt fixture ID must be a positive decimal string.");
  }
  if (!/^[0-9a-f]{64}$/i.test(input.market.conditionCommitment)) {
    throw new Error("Receipt condition commitment must be 32-byte hex.");
  }
  if (
    input.market.compilerVersion <= 0 ||
    input.market.statKeys.length === 0 ||
    input.market.legs.length === 0
  ) {
    throw new Error("Receipt condition metadata is incomplete.");
  }
}

function payoutSummary(input: ProofReceiptInput) {
  if (!input.payout || !input.settlement?.winningSide) return null;
  const yesAmount = decimalAmount(input.payout.yesAmount, "YES amount");
  const noAmount = decimalAmount(input.payout.noAmount, "NO amount");
  const totalPoolAmount = yesAmount + noAmount;
  const winningPoolAmount =
    input.settlement.winningSide === "yes" ? yesAmount : noAmount;
  const userStake = input.payout.userStake
    ? decimalAmount(input.payout.userStake, "User stake")
    : null;
  if (winningPoolAmount === 0n) {
    throw new Error("A verified winning side cannot have zero recorded stake.");
  }
  const calculatedClaimAmount = userStake
    ? ((totalPoolAmount * userStake) / winningPoolAmount).toString()
    : null;
  if (
    input.payout.claimedAmount &&
    calculatedClaimAmount !== input.payout.claimedAmount
  ) {
    throw new Error("Receipt claimed amount does not match pool accounting.");
  }

  return {
    winningPoolAmount: winningPoolAmount.toString(),
    totalPoolAmount: totalPoolAmount.toString(),
    formula:
      "floor(total remaining pool × user winning stake ÷ remaining winning stake)",
    calculatedClaimAmount,
  };
}

export function buildProofReceipt(input: ProofReceiptInput): ProofReceipt {
  validateMarket(input);
  if (input.status === "verified") {
    if (
      !input.result ||
      !input.validation ||
      !input.settlement ||
      !input.payout
    ) {
      throw new Error(
        "Verified receipts require result, proof, settlement, and payout data.",
      );
    }
    if (
      input.result.sequence <= 0 ||
      input.result.action !== "game_finalised" ||
      input.result.statusId !== 100 ||
      input.result.stats.length !== input.market.statKeys.length ||
      input.result.stats.some(
        (stat, index) =>
          stat.key !== input.market.statKeys[index] || stat.period !== 100,
      )
    ) {
      throw new Error(
        "Verified receipt result does not match the final condition inputs.",
      );
    }
    if (
      !input.validation.proofAccepted ||
      input.validation.predicateResult === null ||
      input.settlement.observedSequence !== input.result.sequence
    ) {
      throw new Error(
        "Verified receipt proof and settlement binding is incomplete.",
      );
    }
    const expectedWinner: PoolSide = input.validation.predicateResult
      ? "yes"
      : "no";
    if (input.settlement.winningSide !== expectedWinner) {
      throw new Error(
        "Receipt winner does not match the verified predicate result.",
      );
    }
  }

  if (
    input.status !== "verified" &&
    (input.settlement?.winningSide || input.payout?.claimedAmount)
  ) {
    throw new Error(
      "Pending or failed receipts cannot present a payout winner or claim.",
    );
  }

  const summary = input.status === "verified" ? payoutSummary(input) : null;
  const canPayout =
    input.status === "verified" &&
    input.validation?.proofAccepted === true &&
    typeof input.settlement?.winningSide === "string";

  return {
    ...input,
    canPayout,
    explorer: {
      pool: solanaAddressUrl(input.market.poolAddress),
      proofPlayProgram: input.settlement
        ? solanaAddressUrl(input.settlement.proofPlayProgramId)
        : null,
      txlineProgram: input.validation
        ? solanaAddressUrl(input.validation.txlineProgramId)
        : null,
      settlementTransaction: input.settlement
        ? solanaTransactionUrl(input.settlement.transactionSignature)
        : null,
      dailyScoresRoot: input.validation
        ? solanaAddressUrl(input.validation.dailyScoresRoot)
        : null,
    },
    payoutSummary: summary,
  };
}

export type DevnetEvidence = {
  programId: string;
  txlineProgramId: string;
  fixture: {
    fixtureId: string;
    sequence: number;
    action: string;
    statusId: number | null;
  };
  condition: {
    compilerVersion: number;
    conditionCommitmentHex: string;
    statKeys: number[];
    statement: string;
    legs: string[];
  };
  proof: {
    timestampMs: number;
    dailyScoresRoot: string;
    eventStatRoot: string;
    stats: ReceiptStat[];
  };
  pool: {
    address: string;
    settleSignature: string;
    finalState: string;
    yesAmount: string;
    noAmount: string;
    winningStake: string;
    winnerClaimedAmount: string;
    tokenDecimals: number;
  };
  settlement: {
    predicateResult: boolean;
    winningSide: PoolSide;
    observedSequence: string;
  };
};

export function receiptFromDevnetEvidence(
  evidence: DevnetEvidence,
): ProofReceipt {
  return buildProofReceipt({
    status: "verified",
    statusMessage: "TxLINE proof accepted on Solana devnet",
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
      action: evidence.fixture.action,
      statusId: evidence.fixture.statusId,
      stats: evidence.proof.stats,
    },
    validation: {
      proofAccepted: true,
      predicateResult: evidence.settlement.predicateResult,
      txlineProgramId: evidence.txlineProgramId,
      dailyScoresRoot: evidence.proof.dailyScoresRoot,
      proofTimestampMs: evidence.proof.timestampMs,
      eventStatRoot: evidence.proof.eventStatRoot,
    },
    settlement: {
      proofPlayProgramId: evidence.programId,
      transactionSignature: evidence.pool.settleSignature,
      observedSequence: Number(evidence.settlement.observedSequence),
      winningSide: evidence.settlement.winningSide,
      poolState: evidence.pool.finalState,
    },
    payout: {
      yesAmount: evidence.pool.yesAmount,
      noAmount: evidence.pool.noAmount,
      userStake: evidence.pool.winningStake,
      claimedAmount: evidence.pool.winnerClaimedAmount,
      tokenDecimals: evidence.pool.tokenDecimals,
    },
  });
}
