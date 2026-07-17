import { Keypair } from "@solana/web3.js";
import nacl from "tweetnacl";
import { describe, expect, it, vi } from "vitest";
import {
  TxlineApiClient,
  TxlineDiagnosticError,
  getTxlineNetworkConfig,
  parseSseJsonData,
  redactTxlineSecrets,
} from "../packages/txline/src";
import {
  activationMessage,
  signActivationMessage,
} from "../packages/txline/src/server";
import {
  extractRecords,
  readNumericField,
} from "../packages/txline/src/verification";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddress,
} from "../packages/txline/src/token";

describe("TxLINE devnet integration", () => {
  it("pins every network-sensitive devnet value", () => {
    expect(getTxlineNetworkConfig("devnet")).toMatchObject({
      apiOrigin: "https://txline-dev.txodds.com",
      programId: "6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J",
      tokenMint: "4Zao8ocPhmMgq7PdsYWyxvqySMGx7xb9cMftPMkEokRG",
    });

    expect(() =>
      getTxlineNetworkConfig("devnet", {
        apiOrigin: "https://txline.txodds.com",
      }),
    ).toThrow(/devnet mismatch/);
  });

  it("signs the exact empty-league activation preimage", () => {
    const payer = Keypair.generate();
    const message = activationMessage("transaction", [], "guest-jwt");
    const signature = signActivationMessage(
      "transaction",
      [],
      "guest-jwt",
      payer.secretKey,
    );

    expect(message).toBe("transaction::guest-jwt");
    expect(
      nacl.sign.detached.verify(
        new TextEncoder().encode(message),
        Buffer.from(signature, "base64"),
        payer.publicKey.toBytes(),
      ),
    ).toBe(true);
  });

  it("builds the standard idempotent Token-2022 ATA instruction", () => {
    const payer = Keypair.generate().publicKey;
    const mint = Keypair.generate().publicKey;
    const associatedToken = getAssociatedTokenAddress(mint, payer);
    const instruction = createAssociatedTokenAccountIdempotentInstruction(
      payer,
      associatedToken,
      payer,
      mint,
    );

    expect(instruction.programId.equals(ASSOCIATED_TOKEN_PROGRAM_ID)).toBe(
      true,
    );
    expect([...instruction.data]).toEqual([1]);
    expect(instruction.keys).toHaveLength(6);
    expect(instruction.keys[5]?.pubkey.equals(TOKEN_2022_PROGRAM_ID)).toBe(
      true,
    );
  });

  it("renews a guest JWT once and keeps the activated API token", async () => {
    const requests: Headers[] = [];
    const requestUrls: string[] = [];
    const fetchMock = vi.fn(
      async (input: URL | RequestInfo, init?: RequestInit) => {
        requestUrls.push(input.toString());
        requests.push(new Headers(init?.headers));
        if (requests.length === 1) {
          return new Response('{"error":"expired"}', { status: 401 });
        }
        return Response.json([{ FixtureId: 123 }]);
      },
    ) as unknown as typeof fetch;
    const client = new TxlineApiClient(
      getTxlineNetworkConfig("devnet"),
      { apiToken: "stable-api-token", guestJwt: "expired-jwt" },
      {
        fetch: fetchMock,
        renewGuestJwt: async () => "fresh-jwt",
      },
    );

    await expect(client.getJson("/fixtures/snapshot")).resolves.toEqual([
      { FixtureId: 123 },
    ]);
    expect(requests).toHaveLength(2);
    expect(new URL(requestUrls[0]!).pathname).toBe("/api/fixtures/snapshot");
    expect(requests[0]?.get("Authorization")).toBe("Bearer expired-jwt");
    expect(requests[1]?.get("Authorization")).toBe("Bearer fresh-jwt");
    expect(requests[1]?.get("X-Api-Token")).toBe("stable-api-token");
  });

  it("turns an invalid proof sequence into an actionable diagnostic", async () => {
    const client = new TxlineApiClient(
      getTxlineNetworkConfig("devnet"),
      { apiToken: "api-token", guestJwt: "guest-jwt" },
      {
        fetch: vi.fn(
          async () =>
            new Response('{"error":"sequence not found"}', { status: 404 }),
        ) as unknown as typeof fetch,
      },
    );

    await expect(
      client.getJson("/scores/stat-validation?fixtureId=1&seq=0&statKeys=1"),
    ).rejects.toMatchObject({
      code: "TXLINE_INVALID_SEQUENCE",
      status: 404,
    } satisfies Partial<TxlineDiagnosticError>);
  });

  it("normalizes documented response wrappers and numeric field casing", () => {
    const records = extractRecords({ data: [{ FixtureId: 42, Seq: "991" }] });
    expect(records).toHaveLength(1);
    expect(readNumericField(records[0]!, ["seq", "Seq"])).toBe(991);
  });

  it("decodes TxLINE historical replay records from SSE framing", () => {
    expect(
      parseSseJsonData(
        'data: {"FixtureId":42,"Seq":1}\nid: 1\n\ndata: {"FixtureId":42,"Seq":2}\nid: 2\n\n',
      ),
    ).toEqual([
      { FixtureId: 42, Seq: 1 },
      { FixtureId: 42, Seq: 2 },
    ]);
  });

  it("redacts credentials before including response data in diagnostics", () => {
    expect(
      redactTxlineSecrets(
        'Authorization: Bearer abc.def {"apiToken":"secret-token"}',
      ),
    ).toBe('Authorization: Bearer [redacted] {"apiToken":"[redacted]"}');
  });
});
