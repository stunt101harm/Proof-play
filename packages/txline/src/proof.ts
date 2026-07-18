import { BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";

import { TXLINE_DEVNET } from "./network";
import type { TxlineScoreProofV3 } from "./types";

export const TXLINE_MILLISECONDS_PER_DAY = 86_400_000;
export const TXLINE_FINAL_MATCH_PERIOD = 100;

export function txlineDailyScoresRootAddress(
  timestampMs: number,
  programId = new PublicKey(TXLINE_DEVNET.programId),
) {
  if (!Number.isSafeInteger(timestampMs) || timestampMs < 0) {
    throw new Error(
      "TxLINE proof timestamp must be a non-negative safe integer.",
    );
  }
  const epochDay = Math.floor(timestampMs / TXLINE_MILLISECONDS_PER_DAY);
  if (epochDay > 0xffff) {
    throw new Error("TxLINE proof epoch day does not fit in a u16.");
  }
  const epochBytes = Buffer.alloc(2);
  epochBytes.writeUInt16LE(epochDay);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("daily_scores_roots"), epochBytes],
    programId,
  )[0];
}

export function toAnchorStatValidationInputV3(
  payload: TxlineScoreProofV3["payload"],
) {
  return {
    ts: new BN(payload.ts),
    fixtureSummary: {
      fixtureId: new BN(payload.fixtureSummary.fixtureId),
      updateStats: {
        updateCount: payload.fixtureSummary.updateStats.updateCount,
        minTimestamp: new BN(payload.fixtureSummary.updateStats.minTimestamp),
        maxTimestamp: new BN(payload.fixtureSummary.updateStats.maxTimestamp),
      },
      eventsSubTreeRoot: payload.fixtureSummary.eventsSubTreeRoot,
    },
    fixtureProof: payload.fixtureProof,
    mainTreeProof: payload.mainTreeProof,
    eventStatRoot: payload.eventStatRoot,
    leaves: payload.leaves,
    multiproofHashes: payload.multiproofHashes,
    leafIndices: payload.leafIndices,
  };
}
