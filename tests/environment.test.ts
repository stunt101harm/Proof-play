import { describe, expect, it } from "vitest";
import { readPublicEnv, readTxlineServerEnv } from "../apps/web/lib/env";

describe("environment validation", () => {
  it("provides safe devnet public defaults", () => {
    expect(readPublicEnv({})).toEqual({
      proofPlayProgramId: "AJwjCjk9sb9SWMiuLWDCDgnL6zFEENgnULfkCYaU5Ar",
      solanaNetwork: "devnet",
      solanaRpcUrl: "https://api.devnet.solana.com/",
    });
  });

  it("rejects an unsupported public network", () => {
    expect(() =>
      readPublicEnv({ NEXT_PUBLIC_SOLANA_NETWORK: "mainnet" }),
    ).toThrow(/NEXT_PUBLIC_SOLANA_NETWORK/);
  });

  it("requires server credentials only when the TxLINE client is created", () => {
    expect(() => readTxlineServerEnv({})).toThrow(/TXLINE_GUEST_JWT/);

    expect(
      readTxlineServerEnv({
        TXLINE_API_ORIGIN: "https://txline-dev.txodds.com",
        TXLINE_API_TOKEN: "api-token",
        TXLINE_GUEST_JWT: "guest-jwt",
      }),
    ).toEqual({
      apiOrigin: "https://txline-dev.txodds.com/",
      apiToken: "api-token",
      guestJwt: "guest-jwt",
    });
  });
});
