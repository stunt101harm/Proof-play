import type { TxlineValidationStrategy } from "@proof-play/condition-engine";
import {
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  type AccountInfo,
} from "@solana/web3.js";
import { Buffer } from "buffer/";

export const PROOF_PLAY_DEVNET_GENESIS =
  "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";
export const DEMO_TOKEN_DECIMALS = 6;
export const DEMO_TOKEN_UNIT = 10n ** BigInt(DEMO_TOKEN_DECIMALS);
export const TOKEN_PROGRAM_ID = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
);
export const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
);

const instructionDiscriminators = {
  createPool: [233, 146, 209, 142, 207, 104, 64, 188],
  joinPool: [14, 65, 62, 16, 116, 17, 195, 107],
  claim: [62, 198, 214, 193, 213, 159, 108, 210],
  refund: [2, 96, 183, 251, 63, 208, 46, 46],
} as const;

const accountDiscriminators = {
  pool: [241, 154, 109, 4, 17, 177, 109, 188],
  position: [170, 188, 143, 228, 122, 64, 247, 208],
} as const;

export type PoolSide = "yes" | "no";
export type PoolState =
  "open" | "locked" | "settledYes" | "settledNo" | "cancelled" | "closed";

export type PoolAccount = {
  address: PublicKey;
  creator: PublicKey;
  fixtureId: bigint;
  poolId: bigint;
  tokenMint: PublicKey;
  conditionCommitmentHex: string;
  compilerVersion: number;
  cutoffUnixSeconds: bigint;
  refundAfterUnixSeconds: bigint;
  createdAt: bigint;
  state: PoolState;
  winningSide: PoolSide | null;
  yesAmount: bigint;
  noAmount: bigint;
  remainingPoolAmount: bigint;
  remainingWinningStake: bigint;
  settledSequence: bigint;
  demoMode: boolean;
};

export type PositionAccount = {
  address: PublicKey;
  pool: PublicKey;
  owner: PublicKey;
  side: PoolSide;
  amount: bigint;
  claimed: boolean;
  refunded: boolean;
};

export type CreatePoolInstructionInput = {
  programId: PublicKey;
  creator: PublicKey;
  tokenMint: PublicKey;
  poolId: bigint;
  fixtureId: bigint;
  conditionCommitmentHex: string;
  compilerVersion: number;
  cutoffUnixSeconds: bigint;
  refundAfterUnixSeconds: bigint;
  statKeys: number[];
  strategy: TxlineValidationStrategy;
};

class BorshWriter {
  private readonly values: number[] = [];

  bytes(value: readonly number[] | Uint8Array) {
    this.values.push(...value);
  }

  u8(value: number) {
    if (!Number.isInteger(value) || value < 0 || value > 255) {
      throw new Error("u8 value is outside its valid range.");
    }
    this.values.push(value);
  }

  bool(value: boolean) {
    this.u8(value ? 1 : 0);
  }

  u16(value: number) {
    this.integer(BigInt(value), 2, false);
  }

  u32(value: number) {
    this.integer(BigInt(value), 4, false);
  }

  i32(value: number) {
    this.integer(BigInt(value), 4, true);
  }

  u64(value: bigint) {
    this.integer(value, 8, false);
  }

  i64(value: bigint) {
    this.integer(value, 8, true);
  }

  vec<T>(items: readonly T[], encode: (item: T) => void) {
    this.u32(items.length);
    for (const item of items) encode(item);
  }

  finish() {
    return Uint8Array.from(this.values);
  }

  private integer(value: bigint, width: number, signed: boolean) {
    const bits = BigInt(width * 8);
    const minimum = signed ? -(1n << (bits - 1n)) : 0n;
    const maximum = signed ? (1n << (bits - 1n)) - 1n : (1n << bits) - 1n;
    if (value < minimum || value > maximum) {
      throw new Error(`${signed ? "Signed" : "Unsigned"} integer overflow.`);
    }
    let encoded = value < 0 ? (1n << bits) + value : value;
    for (let index = 0; index < width; index += 1) {
      this.values.push(Number(encoded & 0xffn));
      encoded >>= 8n;
    }
  }
}

class BorshReader {
  private offset = 0;

  constructor(private readonly data: Uint8Array) {}

  bytes(length: number) {
    this.require(length);
    const result = this.data.slice(this.offset, this.offset + length);
    this.offset += length;
    return result;
  }

  u8() {
    return Number(this.integer(1, false));
  }

  bool() {
    const value = this.u8();
    if (value !== 0 && value !== 1) throw new Error("Invalid Borsh boolean.");
    return value === 1;
  }

  u16() {
    return Number(this.integer(2, false));
  }

  u64() {
    return this.integer(8, false);
  }

  i64() {
    return this.integer(8, true);
  }

  publicKey() {
    return new PublicKey(this.bytes(32));
  }

  private integer(width: number, signed: boolean) {
    const bytes = this.bytes(width);
    let value = 0n;
    for (let index = width - 1; index >= 0; index -= 1) {
      value = (value << 8n) | BigInt(bytes[index]!);
    }
    if (signed) {
      const bits = BigInt(width * 8);
      const sign = 1n << (bits - 1n);
      if ((value & sign) !== 0n) value -= 1n << bits;
    }
    return value;
  }

  private require(length: number) {
    if (this.offset + length > this.data.length) {
      throw new Error("Account data ended before the expected field.");
    }
  }
}

function equalBytes(left: Uint8Array, right: readonly number[]) {
  return (
    left.length === right.length &&
    right.every((value, index) => left[index] === value)
  );
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join(
    "",
  );
}

function hexToBytes(value: string) {
  if (!/^[0-9a-f]{64}$/i.test(value)) {
    throw new Error("Condition commitment must be exactly 32 bytes of hex.");
  }
  return Uint8Array.from(
    value.match(/.{2}/g)!.map((byte) => Number.parseInt(byte, 16)),
  );
}

function instructionData(value: readonly number[] | Uint8Array) {
  return Buffer.from(
    Uint8Array.from(value),
  ) as unknown as TransactionInstruction["data"];
}

function sideIndex(side: PoolSide) {
  return side === "yes" ? 0 : 1;
}

function encodeTraderPredicate(
  writer: BorshWriter,
  predicate: {
    threshold: number;
    comparison:
      | { greaterThan: Record<string, never> }
      | { lessThan: Record<string, never> }
      | { equalTo: Record<string, never> };
  },
) {
  writer.i32(predicate.threshold);
  writer.u8(
    "greaterThan" in predicate.comparison
      ? 0
      : "lessThan" in predicate.comparison
        ? 1
        : 2,
  );
}

function encodeStrategy(
  writer: BorshWriter,
  strategy: TxlineValidationStrategy,
) {
  if (strategy.geometricTargets.length !== 0 || strategy.distancePredicate) {
    throw new Error("Compiler v1 must use only discrete TxLINE predicates.");
  }
  writer.u32(0);
  writer.u8(0);
  writer.vec(strategy.discretePredicates, (item) => {
    if ("single" in item) {
      writer.u8(0);
      writer.u8(item.single.index);
      encodeTraderPredicate(writer, item.single.predicate);
      return;
    }
    writer.u8(1);
    writer.u8(item.binary.indexA);
    writer.u8(item.binary.indexB);
    writer.u8("add" in item.binary.op ? 0 : 1);
    encodeTraderPredicate(writer, item.binary.predicate);
  });
}

function u64Seed(value: bigint) {
  const writer = new BorshWriter();
  writer.u64(value);
  return writer.finish();
}

export function derivePoolAddress(
  programId: PublicKey,
  creator: PublicKey,
  poolId: bigint,
) {
  return PublicKey.findProgramAddressSync(
    [new TextEncoder().encode("pool"), creator.toBytes(), u64Seed(poolId)],
    programId,
  )[0];
}

export function deriveVaultAddress(programId: PublicKey, pool: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [new TextEncoder().encode("vault"), pool.toBytes()],
    programId,
  )[0];
}

export function deriveSettlementConfigAddress(
  programId: PublicKey,
  pool: PublicKey,
) {
  return PublicKey.findProgramAddressSync(
    [new TextEncoder().encode("settlement_config"), pool.toBytes()],
    programId,
  )[0];
}

export function derivePositionAddress(
  programId: PublicKey,
  pool: PublicKey,
  owner: PublicKey,
) {
  return PublicKey.findProgramAddressSync(
    [new TextEncoder().encode("position"), pool.toBytes(), owner.toBytes()],
    programId,
  )[0];
}

export function deriveAssociatedTokenAddress(
  mint: PublicKey,
  owner: PublicKey,
) {
  if (!PublicKey.isOnCurve(owner.toBytes())) {
    throw new Error(
      "Associated token account owner must be an on-curve wallet.",
    );
  }
  return PublicKey.findProgramAddressSync(
    [owner.toBytes(), TOKEN_PROGRAM_ID.toBytes(), mint.toBytes()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  )[0];
}

export function createAssociatedTokenAccountIdempotentInstruction(input: {
  payer: PublicKey;
  associatedToken: PublicKey;
  owner: PublicKey;
  mint: PublicKey;
}) {
  return new TransactionInstruction({
    programId: ASSOCIATED_TOKEN_PROGRAM_ID,
    data: instructionData([1]),
    keys: [
      { pubkey: input.payer, isSigner: true, isWritable: true },
      { pubkey: input.associatedToken, isSigner: false, isWritable: true },
      { pubkey: input.owner, isSigner: false, isWritable: false },
      { pubkey: input.mint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
  });
}

export function decodeTokenMintDecimals(account: AccountInfo<Uint8Array>) {
  if (!account.owner.equals(TOKEN_PROGRAM_ID)) {
    throw new Error("Pool collateral mint is not a legacy SPL Token mint.");
  }
  if (account.data.length < 82 || account.data[45] !== 1) {
    throw new Error("Pool collateral mint account is malformed or inactive.");
  }
  const decimals = account.data[44]!;
  if (decimals > 18) {
    throw new Error("Pool collateral mint uses unsupported token precision.");
  }
  return decimals;
}

export function createPoolInstruction(input: CreatePoolInstructionInput) {
  const pool = derivePoolAddress(input.programId, input.creator, input.poolId);
  const vault = deriveVaultAddress(input.programId, pool);
  const settlementConfig = deriveSettlementConfigAddress(input.programId, pool);
  const writer = new BorshWriter();
  writer.bytes(instructionDiscriminators.createPool);
  writer.u64(input.poolId);
  writer.i64(input.fixtureId);
  writer.bytes(hexToBytes(input.conditionCommitmentHex));
  writer.u16(input.compilerVersion);
  writer.i64(input.cutoffUnixSeconds);
  writer.i64(input.refundAfterUnixSeconds);
  writer.bool(false);
  writer.vec(input.statKeys, (statKey) => writer.u32(statKey));
  encodeStrategy(writer, input.strategy);

  return {
    pool,
    vault,
    settlementConfig,
    instruction: new TransactionInstruction({
      programId: input.programId,
      keys: [
        { pubkey: input.creator, isSigner: true, isWritable: true },
        { pubkey: pool, isSigner: false, isWritable: true },
        { pubkey: vault, isSigner: false, isWritable: true },
        { pubkey: settlementConfig, isSigner: false, isWritable: true },
        { pubkey: input.tokenMint, isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: instructionData(writer.finish()),
    }),
  };
}

export function joinPoolInstructions(input: {
  programId: PublicKey;
  participant: PublicKey;
  pool: PoolAccount;
  side: PoolSide;
  amount: bigint;
  participantTokenAccountExists: boolean;
}) {
  if (input.amount <= 0n) throw new Error("Deposit must be greater than zero.");
  const participantTokens = deriveAssociatedTokenAddress(
    input.pool.tokenMint,
    input.participant,
  );
  const position = derivePositionAddress(
    input.programId,
    input.pool.address,
    input.participant,
  );
  const writer = new BorshWriter();
  writer.bytes(instructionDiscriminators.joinPool);
  writer.u8(sideIndex(input.side));
  writer.u64(input.amount);
  const instructions: TransactionInstruction[] = [];
  if (!input.participantTokenAccountExists) {
    instructions.push(
      createAssociatedTokenAccountIdempotentInstruction({
        payer: input.participant,
        associatedToken: participantTokens,
        owner: input.participant,
        mint: input.pool.tokenMint,
      }),
    );
  }
  instructions.push(
    new TransactionInstruction({
      programId: input.programId,
      keys: [
        { pubkey: input.participant, isSigner: true, isWritable: true },
        { pubkey: input.pool.address, isSigner: false, isWritable: true },
        {
          pubkey: deriveVaultAddress(input.programId, input.pool.address),
          isSigner: false,
          isWritable: true,
        },
        { pubkey: input.pool.tokenMint, isSigner: false, isWritable: false },
        { pubkey: participantTokens, isSigner: false, isWritable: true },
        { pubkey: position, isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: instructionData(writer.finish()),
    }),
  );
  return { instructions, participantTokens, position };
}

export function payoutInstruction(input: {
  action: "claim" | "refund";
  programId: PublicKey;
  owner: PublicKey;
  pool: PoolAccount;
  destinationTokenAccountExists: boolean;
}) {
  const destinationTokens = deriveAssociatedTokenAddress(
    input.pool.tokenMint,
    input.owner,
  );
  const position = derivePositionAddress(
    input.programId,
    input.pool.address,
    input.owner,
  );
  const instructions: TransactionInstruction[] = [];
  if (!input.destinationTokenAccountExists) {
    instructions.push(
      createAssociatedTokenAccountIdempotentInstruction({
        payer: input.owner,
        associatedToken: destinationTokens,
        owner: input.owner,
        mint: input.pool.tokenMint,
      }),
    );
  }
  const writer = new BorshWriter();
  writer.bytes(instructionDiscriminators[input.action]);
  instructions.push(
    new TransactionInstruction({
      programId: input.programId,
      keys: [
        { pubkey: input.owner, isSigner: true, isWritable: true },
        { pubkey: input.pool.address, isSigner: false, isWritable: true },
        { pubkey: position, isSigner: false, isWritable: true },
        {
          pubkey: deriveVaultAddress(input.programId, input.pool.address),
          isSigner: false,
          isWritable: true,
        },
        { pubkey: input.pool.tokenMint, isSigner: false, isWritable: false },
        { pubkey: destinationTokens, isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      data: instructionData(writer.finish()),
    }),
  );
  return { instructions, destinationTokens, position };
}

function poolState(index: number): PoolState {
  const states: PoolState[] = [
    "open",
    "locked",
    "settledYes",
    "settledNo",
    "cancelled",
    "closed",
  ];
  const state = states[index];
  if (!state) throw new Error("Pool account has an unknown state.");
  return state;
}

function readOptionalSide(reader: BorshReader): PoolSide | null {
  const option = reader.u8();
  if (option === 0) return null;
  if (option !== 1) throw new Error("Pool winner option is malformed.");
  const side = reader.u8();
  if (side > 1) throw new Error("Pool side is malformed.");
  return side === 0 ? "yes" : "no";
}

export function decodePoolAccount(
  address: PublicKey,
  account: AccountInfo<Uint8Array>,
  expectedProgramId: PublicKey,
): PoolAccount {
  if (!account.owner.equals(expectedProgramId)) {
    throw new Error("Pool account is not owned by the ProofPlay program.");
  }
  const reader = new BorshReader(account.data);
  if (!equalBytes(reader.bytes(8), accountDiscriminators.pool)) {
    throw new Error("Address is not a ProofPlay pool account.");
  }
  const decoded: PoolAccount = {
    address,
    creator: reader.publicKey(),
    fixtureId: reader.i64(),
    poolId: reader.u64(),
    tokenMint: reader.publicKey(),
    conditionCommitmentHex: bytesToHex(reader.bytes(32)),
    compilerVersion: reader.u16(),
    cutoffUnixSeconds: reader.i64(),
    refundAfterUnixSeconds: reader.i64(),
    createdAt: reader.i64(),
    state: poolState(reader.u8()),
    winningSide: readOptionalSide(reader),
    yesAmount: reader.u64(),
    noAmount: reader.u64(),
    remainingPoolAmount: reader.u64(),
    remainingWinningStake: reader.u64(),
    settledSequence: reader.u64(),
    demoMode: reader.bool(),
  };
  if (
    !derivePoolAddress(
      expectedProgramId,
      decoded.creator,
      decoded.poolId,
    ).equals(address)
  ) {
    throw new Error("Pool address does not match its canonical PDA seeds.");
  }
  return decoded;
}

export function decodePositionAccount(
  address: PublicKey,
  account: AccountInfo<Uint8Array>,
  expectedProgramId: PublicKey,
): PositionAccount {
  if (!account.owner.equals(expectedProgramId)) {
    throw new Error("Position account is not owned by the ProofPlay program.");
  }
  const reader = new BorshReader(account.data);
  if (!equalBytes(reader.bytes(8), accountDiscriminators.position)) {
    throw new Error("Address is not a ProofPlay position account.");
  }
  const pool = reader.publicKey();
  const owner = reader.publicKey();
  const side = reader.u8();
  if (side > 1) throw new Error("Position side is malformed.");
  const decoded: PositionAccount = {
    address,
    pool,
    owner,
    side: side === 0 ? "yes" : "no",
    amount: reader.u64(),
    claimed: reader.bool(),
    refunded: reader.bool(),
  };
  if (
    !derivePositionAddress(
      expectedProgramId,
      decoded.pool,
      decoded.owner,
    ).equals(address)
  ) {
    throw new Error("Position address does not match its canonical PDA seeds.");
  }
  return decoded;
}

export function calculatePayout(input: {
  remainingPoolAmount: bigint;
  remainingWinningStake: bigint;
  positionAmount: bigint;
}) {
  if (
    input.remainingPoolAmount < 0n ||
    input.remainingWinningStake <= 0n ||
    input.positionAmount <= 0n ||
    input.positionAmount > input.remainingWinningStake
  ) {
    return 0n;
  }
  return (
    (input.remainingPoolAmount * input.positionAmount) /
    input.remainingWinningStake
  );
}

export function estimateOpenPoolPayout(input: {
  yesAmount: bigint;
  noAmount: bigint;
  side: PoolSide;
  existingPositionAmount: bigint;
  depositAmount: bigint;
}) {
  if (input.depositAmount <= 0n || input.existingPositionAmount < 0n) return 0n;
  const total = input.yesAmount + input.noAmount + input.depositAmount;
  const winningSideTotal =
    (input.side === "yes" ? input.yesAmount : input.noAmount) +
    input.depositAmount;
  return calculatePayout({
    remainingPoolAmount: total,
    remainingWinningStake: winningSideTotal,
    positionAmount: input.existingPositionAmount + input.depositAmount,
  });
}

export function formatDemoTokens(value: bigint) {
  return formatTokenAmount(value, DEMO_TOKEN_DECIMALS);
}

export function formatTokenAmount(value: bigint, decimals: number) {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) {
    throw new Error("Token decimals are outside the supported display range.");
  }
  const unit = 10n ** BigInt(decimals);
  const whole = value / unit;
  const fraction = (value % unit)
    .toString()
    .padStart(decimals, "0")
    .replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

export function parseDemoTokens(value: string) {
  return parseTokenAmount(value, DEMO_TOKEN_DECIMALS);
}

export function parseTokenAmount(value: string, decimals: number) {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) {
    throw new Error("Token decimals are outside the supported input range.");
  }
  const expression =
    decimals === 0 ? /^\d+$/ : new RegExp(`^\\d+(?:\\.\\d{0,${decimals}})?$`);
  if (!expression.test(value.trim())) {
    throw new Error(
      `Enter a positive amount with at most ${decimals} decimal places.`,
    );
  }
  const [whole, fraction = ""] = value.trim().split(".");
  const unit = 10n ** BigInt(decimals);
  const amount =
    BigInt(whole!) * unit + BigInt(fraction.padEnd(decimals, "0") || "0");
  if (amount <= 0n) throw new Error("Deposit must be greater than zero.");
  return amount;
}

export function explorerTransactionUrl(signature: string) {
  return `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
}

export function explorerAddressUrl(address: PublicKey | string) {
  return `https://explorer.solana.com/address/${address.toString()}?cluster=devnet`;
}
