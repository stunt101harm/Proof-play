import { describe, expect, it } from "vitest";
import { PRODUCT, SYSTEM_COMPONENTS } from "@proof-play/domain";
import { CONDITION_LIMITS } from "@proof-play/condition-engine";
import { getTxlineNetworkConfig } from "@proof-play/txline";

describe("workspace contract", () => {
  it("shares the frozen MVP constants across packages", () => {
    expect(PRODUCT.name).toBe("ProofPlay");
    expect(CONDITION_LIMITS.maxLegs).toBe(2);
    expect(CONDITION_LIMITS.maxUniqueStatKeys).toBe(4);
    expect(SYSTEM_COMPONENTS).toHaveLength(4);
  });

  it("defaults the TxLINE adapter to the documented devnet host", () => {
    expect(getTxlineNetworkConfig("devnet")).toMatchObject({
      apiOrigin: "https://txline-dev.txodds.com",
      programId: "6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J",
      tokenMint: "4Zao8ocPhmMgq7PdsYWyxvqySMGx7xb9cMftPMkEokRG",
    });
  });
});
