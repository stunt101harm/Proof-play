import { compileCondition } from "@proof-play/condition-engine";
import { PublicKey, type AccountInfo } from "@solana/web3.js";
import { Buffer } from "buffer";
import { describe, expect, it } from "vitest";

import { poolActionAvailability } from "../apps/web/lib/pool-actions";
import {
  calculatePayout,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createPoolInstruction,
  decodeTokenMintDecimals,
  decodePoolAccount,
  derivePoolAddress,
  derivePositionAddress,
  estimateOpenPoolPayout,
  formatTokenAmount,
  joinPoolInstructions,
  parseTokenAmount,
  type PoolAccount,
  type PositionAccount,
} from "../apps/web/lib/proof-play-program";

const programId = new PublicKey("AJwjCjk9sb9SWMiuLWDCDgnL6zFEENgnULfkCYaU5Ar");
const creator = new PublicKey("FxS7FgTfcn8wFBC96p2ngu7n7JG2ab4iCxn5dzBamhKp");
const mint = new PublicKey("C6eDfhad3BqR99NxMyvhQf9EGqG9DSe71xVomb4u9H1w");

function writeU64(buffer: Buffer, offset: number, value: bigint) {
  buffer.writeBigUInt64LE(value, offset);
  return offset + 8;
}

function encodedPool(address: PublicKey): {
  account: AccountInfo<Buffer>;
  expected: PoolAccount;
} {
  const data = Buffer.alloc(191);
  let offset = 0;
  Buffer.from([241, 154, 109, 4, 17, 177, 109, 188]).copy(data, offset);
  offset += 8;
  creator.toBuffer().copy(data, offset);
  offset += 32;
  data.writeBigInt64LE(18_241_006n, offset);
  offset += 8;
  offset = writeU64(data, offset, 99n);
  mint.toBuffer().copy(data, offset);
  offset += 32;
  Buffer.from("ab".repeat(32), "hex").copy(data, offset);
  offset += 32;
  data.writeUInt16LE(1, offset);
  offset += 2;
  data.writeBigInt64LE(1_800_000_000n, offset);
  offset += 8;
  data.writeBigInt64LE(1_800_003_600n, offset);
  offset += 8;
  data.writeBigInt64LE(1_799_999_000n, offset);
  offset += 8;
  data.writeUInt8(2, offset);
  offset += 1;
  data.writeUInt8(1, offset);
  offset += 1;
  data.writeUInt8(0, offset);
  offset += 1;
  offset = writeU64(data, offset, 4_000_000n);
  offset = writeU64(data, offset, 6_000_000n);
  offset = writeU64(data, offset, 10_000_000n);
  offset = writeU64(data, offset, 4_000_000n);
  offset = writeU64(data, offset, 962n);
  data.writeUInt8(0, offset);
  offset += 1;
  data.writeUInt8(254, offset);

  return {
    account: {
      data,
      executable: false,
      lamports: 1,
      owner: programId,
      rentEpoch: 0,
    },
    expected: {
      address,
      creator,
      fixtureId: 18_241_006n,
      poolId: 99n,
      tokenMint: mint,
      conditionCommitmentHex: "ab".repeat(32),
      compilerVersion: 1,
      cutoffUnixSeconds: 1_800_000_000n,
      refundAfterUnixSeconds: 1_800_003_600n,
      createdAt: 1_799_999_000n,
      state: "settledYes",
      winningSide: "yes",
      yesAmount: 4_000_000n,
      noAmount: 6_000_000n,
      remainingPoolAmount: 10_000_000n,
      remainingWinningStake: 4_000_000n,
      settledSequence: 962n,
      demoMode: false,
    },
  };
}

describe("browser ProofPlay program client", () => {
  it("encodes create_pool exactly like the deployed Anchor IDL", async () => {
    const compiled = await compileCondition({
      version: 1,
      fixtureId: "18241006",
      operator: "all",
      legs: [
        { kind: "participantWins", participant: 2 },
        {
          kind: "totalCorners",
          comparison: "atMost",
          threshold: 7,
        },
      ],
    });
    const built = createPoolInstruction({
      programId,
      creator,
      tokenMint: mint,
      poolId: 123_456_789n,
      fixtureId: 18_241_006n,
      conditionCommitmentHex: compiled.conditionCommitmentHex,
      compilerVersion: compiled.compilerVersion,
      cutoffUnixSeconds: 1_800_000_000n,
      refundAfterUnixSeconds: 1_800_003_600n,
      statKeys: compiled.statKeys,
      strategy: compiled.strategy,
    });

    expect(built.pool.toBase58()).toBe(
      "5WnNXWYpeWjHmBGGUthkvNHKPzFSq1zSEfzo2eWEf18P",
    );
    expect(built.instruction.data.toString("hex")).toBe(
      "e992d18ecf6840bc15cd5b0700000000ee55160100000000d2e7ea3af5761bfa010397b9f3ad89acdb579190666ac5a158106d3ccc771bf3010000d2496b0000000010e0496b00000000000400000001000000020000000700000008000000000000000002000000010100010000000000010203000800000001",
    );
    expect(built.instruction.keys.map((key) => key.pubkey.toBase58())).toEqual([
      creator.toBase58(),
      built.pool.toBase58(),
      built.vault.toBase58(),
      built.settlementConfig.toBase58(),
      mint.toBase58(),
      "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
      "11111111111111111111111111111111",
    ]);
  });

  it("decodes the complete immutable pool and payout state", () => {
    const address = derivePoolAddress(programId, creator, 99n);
    const { account, expected } = encodedPool(address);
    expect(decodePoolAccount(address, account, programId)).toEqual(expected);
  });

  it("derives a stable position and prepares an idempotent join", () => {
    const address = derivePoolAddress(programId, creator, 99n);
    const { expected: pool } = encodedPool(address);
    pool.state = "open";
    pool.winningSide = null;
    const position = derivePositionAddress(programId, address, creator);
    const built = joinPoolInstructions({
      programId,
      participant: creator,
      pool,
      side: "no",
      amount: 1_000_000n,
      participantTokenAccountExists: false,
    });
    expect(built.position).toEqual(position);
    expect(built.instructions).toHaveLength(2);
    expect(built.instructions[0]!.programId).toEqual(
      ASSOCIATED_TOKEN_PROGRAM_ID,
    );
    expect([...built.instructions[0]!.data]).toEqual([1]);
    expect([...built.instructions[1]!.data.subarray(0, 9)]).toEqual([
      14, 65, 62, 16, 116, 17, 195, 107, 1,
    ]);
  });

  it("decodes an initialized legacy SPL mint without the native SPL client", () => {
    const data = Buffer.alloc(82);
    data[44] = 6;
    data[45] = 1;
    expect(
      decodeTokenMintDecimals({
        data,
        executable: false,
        lamports: 1,
        owner: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
        rentEpoch: 0,
      }),
    ).toBe(6);
  });
});

describe("pool participation accounting", () => {
  it("matches the program's floor-and-final-remainder payout math", () => {
    expect(
      calculatePayout({
        remainingPoolAmount: 10n,
        remainingWinningStake: 3n,
        positionAmount: 1n,
      }),
    ).toBe(3n);
    expect(
      calculatePayout({
        remainingPoolAmount: 7n,
        remainingWinningStake: 2n,
        positionAmount: 2n,
      }),
    ).toBe(7n);
    expect(
      estimateOpenPoolPayout({
        yesAmount: 3_000_000n,
        noAmount: 6_000_000n,
        side: "yes",
        existingPositionAmount: 0n,
        depositAmount: 1_000_000n,
      }),
    ).toBe(2_500_000n);
  });

  it("parses and renders token units without floating-point math", () => {
    expect(parseTokenAmount("12.3456", 6)).toBe(12_345_600n);
    expect(formatTokenAmount(12_345_600n, 6)).toBe("12.3456");
    expect(() => parseTokenAmount("1.0000001", 6)).toThrow(/at most 6/i);
  });

  it("exposes only the action allowed by pool and position state", () => {
    const address = derivePoolAddress(programId, creator, 99n);
    const { expected: pool } = encodedPool(address);
    const position: PositionAccount = {
      address: derivePositionAddress(programId, address, creator),
      pool: address,
      owner: creator,
      side: "yes",
      amount: 4_000_000n,
      claimed: false,
      refunded: false,
    };
    expect(
      poolActionAvailability({
        pool,
        position,
        selectedSide: "yes",
        currentUnixSeconds: 1_799_999_999,
        collateralAccepted: true,
        metadataVerified: true,
      }),
    ).toMatchObject({ join: false, claim: true, refund: false });
    pool.state = "cancelled";
    pool.winningSide = null;
    expect(
      poolActionAvailability({
        pool,
        position,
        selectedSide: "yes",
        currentUnixSeconds: 1_799_999_999,
        collateralAccepted: true,
        metadataVerified: true,
      }),
    ).toMatchObject({ join: false, claim: false, refund: true });

    pool.state = "closed";
    expect(
      poolActionAvailability({
        pool,
        position: null,
        selectedSide: "yes",
        currentUnixSeconds: 1_799_999_999,
        collateralAccepted: false,
        metadataVerified: true,
      }),
    ).toMatchObject({
      join: false,
      claim: false,
      refund: false,
      reason: expect.stringMatching(/economically complete/i),
    });
  });
});
