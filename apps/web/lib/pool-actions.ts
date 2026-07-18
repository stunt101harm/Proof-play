import type {
  PoolAccount,
  PoolSide,
  PositionAccount,
} from "@/lib/proof-play-program";

export type PoolActionAvailability = {
  join: boolean;
  claim: boolean;
  refund: boolean;
  reason: string;
};

export function poolActionAvailability(input: {
  pool: PoolAccount;
  position: PositionAccount | null;
  selectedSide: PoolSide;
  currentUnixSeconds: number;
  collateralAccepted: boolean;
  metadataVerified: boolean;
}): PoolActionAvailability {
  const { pool, position } = input;
  const claimWinner =
    pool.state === "settledYes"
      ? "yes"
      : pool.state === "settledNo"
        ? "no"
        : null;
  const claim = Boolean(
    claimWinner &&
    position &&
    position.side === claimWinner &&
    !position.claimed &&
    !position.refunded,
  );
  const refund = Boolean(
    pool.state === "cancelled" &&
    position &&
    !position.claimed &&
    !position.refunded,
  );
  const join = Boolean(
    pool.state === "open" &&
    BigInt(input.currentUnixSeconds) < pool.cutoffUnixSeconds &&
    input.collateralAccepted &&
    input.metadataVerified &&
    (!position || position.side === input.selectedSide) &&
    !position?.claimed &&
    !position?.refunded,
  );

  let reason = "No wallet action is available for this pool state.";
  if (claim) reason = "Winning position is ready to claim.";
  else if (refund) reason = "Cancelled pool position is ready to refund.";
  else if (join) reason = "Pool is open for a demo-token deposit.";
  else if (position?.claimed) {
    reason = "This position has already claimed its payout.";
  } else if (position?.refunded) {
    reason = "This position has already been refunded.";
  } else if (pool.state === "locked") {
    reason = "Deposits are locked while final TxLINE settlement is pending.";
  } else if (pool.state === "closed") {
    reason = "This pool is economically complete; no further action is valid.";
  } else if (pool.state === "settledYes" || pool.state === "settledNo") {
    reason = position
      ? "This position is not eligible for another payout action."
      : "This pool is settled; only an eligible winning position can claim.";
  } else if (pool.state === "cancelled") {
    reason = position
      ? "This cancelled position has no remaining refund action."
      : "This pool is cancelled; only an existing position can refund.";
  } else if (!input.metadataVerified) {
    reason =
      "Readable metadata must match the on-chain commitment before joining.";
  } else if (!input.collateralAccepted) {
    reason =
      "This client only permits deposits using the configured ProofPlay demo token.";
  } else if (pool.state === "open" && position?.side !== input.selectedSide) {
    reason = "A wallet position cannot switch sides after its first deposit.";
  } else if (
    pool.state === "open" &&
    BigInt(input.currentUnixSeconds) >= pool.cutoffUnixSeconds
  ) {
    reason =
      "The deposit cutoff has passed; settlement or cancellation is next.";
  }

  return { join, claim, refund, reason };
}
