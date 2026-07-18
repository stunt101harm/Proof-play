import {
  AnchorError,
  AnchorProvider,
  BN,
  Program,
  Wallet,
  type Idl,
} from "@coral-xyz/anchor";
import {
  TOKEN_PROGRAM_ID,
  createMint,
  getAccount,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { compileCondition } from "@proof-play/condition-engine";
import { TXLINE_DEVNET_GENESIS_HASH } from "@proof-play/txline";

const RPC_URL =
  process.env.PROOF_PLAY_RPC_URL ?? "https://api.devnet.solana.com";
const configuredWalletPath = process.env.PROOF_PLAY_WALLET_PATH;
const IDL_PATH = resolve("target/idl/proof_play.json");
const TOKEN_DECIMALS = 6;
const UNIT = 10 ** TOKEN_DECIMALS;
const MIN_SETTLEMENT_GRACE_SECONDS = 3_600;

if (!configuredWalletPath) {
  throw new Error(
    "PROOF_PLAY_WALLET_PATH is required; point it to the funded devnet deployer keypair.",
  );
}
const WALLET_PATH = configuredWalletPath;

type PoolAccountSnapshot = {
  yesAmount: BN;
  noAmount: BN;
  remainingPoolAmount: BN;
  remainingWinningStake: BN;
  state: unknown;
};

async function loadKeypair(path: string): Promise<Keypair> {
  const value = JSON.parse(await readFile(resolve(path), "utf8")) as unknown;
  if (
    !Array.isArray(value) ||
    value.length !== 64 ||
    value.some(
      (byte) =>
        !Number.isInteger(byte) || Number(byte) < 0 || Number(byte) > 255,
    )
  ) {
    throw new Error("The configured deployer keypair file is invalid.");
  }
  return Keypair.fromSecretKey(Uint8Array.from(value as number[]));
}

function poolAddress(programId: PublicKey, creator: PublicKey, poolId: BN) {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("pool"),
      creator.toBuffer(),
      poolId.toArrayLike(Buffer, "le", 8),
    ],
    programId,
  )[0];
}

function vaultAddress(programId: PublicKey, pool: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), pool.toBuffer()],
    programId,
  )[0];
}

function settlementConfigAddress(programId: PublicKey, pool: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("settlement_config"), pool.toBuffer()],
    programId,
  )[0];
}

function positionAddress(
  programId: PublicKey,
  pool: PublicKey,
  owner: PublicKey,
) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("position"), pool.toBuffer(), owner.toBuffer()],
    programId,
  )[0];
}

function enumName(value: unknown): string {
  if (typeof value !== "object" || value === null) return String(value);
  return Object.keys(value)[0] ?? "unknown";
}

function anchorErrorCode(error: unknown): string | null {
  if (error instanceof AnchorError) return error.error.errorCode.code;
  if (typeof error !== "object" || error === null) return null;
  const candidate = error as {
    error?: { errorCode?: { code?: unknown } };
    message?: unknown;
  };
  const code = candidate.error?.errorCode?.code;
  if (typeof code === "string") return code;
  const message =
    typeof candidate.message === "string" ? candidate.message : "";
  return message.match(/Error Code: ([A-Za-z0-9]+)/)?.[1] ?? null;
}

async function expectFailure(
  operation: () => Promise<unknown>,
  expectedCodes: string[],
): Promise<string> {
  try {
    await operation();
  } catch (error) {
    const code = anchorErrorCode(error);
    if (code && expectedCodes.includes(code)) return code;
    throw error;
  }
  throw new Error(`Expected failure: ${expectedCodes.join(" or ")}`);
}

async function chainTimestamp(connection: Connection): Promise<number> {
  const slot = await connection.getSlot("confirmed");
  const timestamp = await connection.getBlockTime(slot);
  if (timestamp === null)
    throw new Error("Devnet did not return a block time.");
  return timestamp;
}

async function waitForTimestamp(
  connection: Connection,
  target: number,
): Promise<void> {
  const deadline = Date.now() + 50_000;
  while (Date.now() < deadline) {
    if ((await chainTimestamp(connection)) >= target) return;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 1_500));
  }
  throw new Error(`Devnet clock did not reach ${target} before timeout.`);
}

async function main() {
  const deployer = await loadKeypair(WALLET_PATH);
  const participant = Keypair.generate();
  const connection = new Connection(RPC_URL, "confirmed");
  const genesisHash = await connection.getGenesisHash();
  if (genesisHash !== TXLINE_DEVNET_GENESIS_HASH) {
    throw new Error(`Expected Solana devnet, received genesis ${genesisHash}.`);
  }

  const idl = JSON.parse(await readFile(IDL_PATH, "utf8")) as Idl;
  const provider = new AnchorProvider(connection, new Wallet(deployer), {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  });
  const program = new Program(idl, provider);
  const programAccount = await connection.getAccountInfo(program.programId);
  if (!programAccount?.executable) {
    throw new Error(`Program ${program.programId.toBase58()} is not deployed.`);
  }

  const participantFundingSignature = await sendAndConfirmTransaction(
    connection,
    new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: deployer.publicKey,
        toPubkey: participant.publicKey,
        lamports: 0.02 * LAMPORTS_PER_SOL,
      }),
    ),
    [deployer],
    { commitment: "confirmed" },
  );
  const mint = await createMint(
    connection,
    deployer,
    deployer.publicKey,
    null,
    TOKEN_DECIMALS,
  );
  const deployerTokens = await getOrCreateAssociatedTokenAccount(
    connection,
    deployer,
    mint,
    deployer.publicKey,
  );
  const participantTokens = await getOrCreateAssociatedTokenAccount(
    connection,
    deployer,
    mint,
    participant.publicKey,
  );
  await mintTo(
    connection,
    deployer,
    mint,
    deployerTokens.address,
    deployer,
    20 * UNIT,
  );
  await mintTo(
    connection,
    deployer,
    mint,
    participantTokens.address,
    deployer,
    10 * UNIT,
  );

  const compiled = await compileCondition({
    version: 1,
    fixtureId: "18241006",
    operator: "all",
    legs: [
      { kind: "participantWins", participant: 2 },
      { kind: "totalCorners", comparison: "atMost", threshold: 7 },
    ],
  });
  const basePoolId = new BN(Date.now().toString());
  const firstPool = poolAddress(
    program.programId,
    deployer.publicKey,
    basePoolId,
  );
  const firstVault = vaultAddress(program.programId, firstPool);
  const firstSettlementConfig = settlementConfigAddress(
    program.programId,
    firstPool,
  );
  const deployerPosition = positionAddress(
    program.programId,
    firstPool,
    deployer.publicKey,
  );
  const participantPosition = positionAddress(
    program.programId,
    firstPool,
    participant.publicKey,
  );
  const now = await chainTimestamp(connection);
  const cutoff = now + 20;
  const refundAfter = cutoff + MIN_SETTLEMENT_GRACE_SECONDS;

  const createSignature = await program.methods
    .createPool(
      {
        poolId: basePoolId,
        fixtureId: new BN(compiled.fixtureId),
        conditionCommitment: Array.from(compiled.conditionCommitment),
        compilerVersion: 1,
        cutoffUnixSeconds: new BN(cutoff),
        refundAfterUnixSeconds: new BN(refundAfter),
        demoMode: true,
      },
      { statKeys: compiled.statKeys, strategy: compiled.strategy },
    )
    .accountsStrict({
      creator: deployer.publicKey,
      pool: firstPool,
      vault: firstVault,
      settlementConfig: firstSettlementConfig,
      tokenMint: mint,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  const joinYesSignature = await program.methods
    .joinPool({ yes: {} }, new BN(4 * UNIT))
    .accountsStrict({
      participant: deployer.publicKey,
      pool: firstPool,
      vault: firstVault,
      tokenMint: mint,
      participantTokens: deployerTokens.address,
      position: deployerPosition,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  const participantProvider = new AnchorProvider(
    connection,
    new Wallet(participant),
    provider.opts,
  );
  const participantProgram = new Program(idl, participantProvider);
  const joinNoSignature = await participantProgram.methods
    .joinPool({ no: {} }, new BN(6 * UNIT))
    .accountsStrict({
      participant: participant.publicKey,
      pool: firstPool,
      vault: firstVault,
      tokenMint: mint,
      participantTokens: participantTokens.address,
      position: participantPosition,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  await waitForTimestamp(connection, cutoff);
  const lateDepositRejection = await expectFailure(
    () =>
      program.methods
        .joinPool({ yes: {} }, new BN(UNIT))
        .accountsStrict({
          participant: deployer.publicKey,
          pool: firstPool,
          vault: firstVault,
          tokenMint: mint,
          participantTokens: deployerTokens.address,
          position: deployerPosition,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc(),
    ["CutoffPassed"],
  );
  const lockSignature = await program.methods
    .lockPool()
    .accountsStrict({ pool: firstPool })
    .rpc();
  const settleSignature = await program.methods
    .recordDemoOutcome({ yes: {} }, new BN(962))
    .accountsStrict({
      creator: deployer.publicKey,
      pool: firstPool,
      vault: firstVault,
    })
    .rpc();

  const losingClaimRejection = await expectFailure(
    () =>
      participantProgram.methods
        .claim()
        .accountsStrict({
          owner: participant.publicKey,
          pool: firstPool,
          position: participantPosition,
          vault: firstVault,
          tokenMint: mint,
          destinationTokens: participantTokens.address,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc(),
    ["NotWinningPosition"],
  );
  const substitutedVaultRejection = await expectFailure(
    () =>
      program.methods
        .claim()
        .accountsStrict({
          owner: deployer.publicKey,
          pool: firstPool,
          position: deployerPosition,
          vault: deployerTokens.address,
          tokenMint: mint,
          destinationTokens: deployerTokens.address,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc(),
    ["ConstraintSeeds"],
  );
  const claimSignature = await program.methods
    .claim()
    .accountsStrict({
      owner: deployer.publicKey,
      pool: firstPool,
      position: deployerPosition,
      vault: firstVault,
      tokenMint: mint,
      destinationTokens: deployerTokens.address,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc();
  const duplicateClaimRejection = await expectFailure(
    () =>
      program.methods
        .claim()
        .accountsStrict({
          owner: deployer.publicKey,
          pool: firstPool,
          position: deployerPosition,
          vault: firstVault,
          tokenMint: mint,
          destinationTokens: deployerTokens.address,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc(),
    ["InvalidPayoutState", "AlreadyClaimed"],
  );

  const secondPoolId = basePoolId.addn(1);
  const secondPool = poolAddress(
    program.programId,
    deployer.publicKey,
    secondPoolId,
  );
  const secondVault = vaultAddress(program.programId, secondPool);
  const secondSettlementConfig = settlementConfigAddress(
    program.programId,
    secondPool,
  );
  const secondPosition = positionAddress(
    program.programId,
    secondPool,
    deployer.publicKey,
  );
  const secondNow = await chainTimestamp(connection);
  const secondCutoff = secondNow + 60;
  const secondCreateSignature = await program.methods
    .createPool(
      {
        poolId: secondPoolId,
        fixtureId: new BN(compiled.fixtureId),
        conditionCommitment: Array.from(compiled.conditionCommitment),
        compilerVersion: 1,
        cutoffUnixSeconds: new BN(secondCutoff),
        refundAfterUnixSeconds: new BN(
          secondCutoff + MIN_SETTLEMENT_GRACE_SECONDS,
        ),
        demoMode: true,
      },
      { statKeys: compiled.statKeys, strategy: compiled.strategy },
    )
    .accountsStrict({
      creator: deployer.publicKey,
      pool: secondPool,
      vault: secondVault,
      settlementConfig: secondSettlementConfig,
      tokenMint: mint,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  const secondJoinSignature = await program.methods
    .joinPool({ no: {} }, new BN(2 * UNIT))
    .accountsStrict({
      participant: deployer.publicKey,
      pool: secondPool,
      vault: secondVault,
      tokenMint: mint,
      participantTokens: deployerTokens.address,
      position: secondPosition,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  const cancelSignature = await program.methods
    .cancelPool()
    .accountsStrict({
      authority: deployer.publicKey,
      pool: secondPool,
      vault: secondVault,
    })
    .rpc();
  const refundSignature = await program.methods
    .refund()
    .accountsStrict({
      owner: deployer.publicKey,
      pool: secondPool,
      position: secondPosition,
      vault: secondVault,
      tokenMint: mint,
      destinationTokens: deployerTokens.address,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc();
  const duplicateRefundRejection = await expectFailure(
    () =>
      program.methods
        .refund()
        .accountsStrict({
          owner: deployer.publicKey,
          pool: secondPool,
          position: secondPosition,
          vault: secondVault,
          tokenMint: mint,
          destinationTokens: deployerTokens.address,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc(),
    ["RefundNotAvailable", "AlreadyRefunded"],
  );

  const poolAccounts = (
    program.account as unknown as {
      pool: { fetch(address: PublicKey): Promise<PoolAccountSnapshot> };
    }
  ).pool;
  const firstPoolAccount = await poolAccounts.fetch(firstPool);
  const secondPoolAccount = await poolAccounts.fetch(secondPool);
  const firstVaultAccount = await getAccount(connection, firstVault);
  const secondVaultAccount = await getAccount(connection, secondVault);

  process.stdout.write(
    `${JSON.stringify(
      {
        verifiedAt: new Date().toISOString(),
        network: "devnet",
        rpcGenesisHash: genesisHash,
        programId: program.programId.toBase58(),
        deployer: deployer.publicKey.toBase58(),
        demoTokenMint: mint.toBase58(),
        compilerVersion: 1,
        conditionCommitmentHex: compiled.conditionCommitmentHex,
        participantFundingSignature,
        settledPool: {
          address: firstPool.toBase58(),
          vault: firstVault.toBase58(),
          createSignature,
          joinYesSignature,
          joinNoSignature,
          lockSignature,
          settleSignature,
          claimSignature,
          yesAmount: firstPoolAccount.yesAmount.toString(),
          noAmount: firstPoolAccount.noAmount.toString(),
          remainingPoolAmount: firstPoolAccount.remainingPoolAmount.toString(),
          remainingWinningStake:
            firstPoolAccount.remainingWinningStake.toString(),
          finalState: enumName(firstPoolAccount.state),
          vaultBalance: firstVaultAccount.amount.toString(),
          rejected: {
            lateDeposit: lateDepositRejection,
            losingClaim: losingClaimRejection,
            substitutedVault: substitutedVaultRejection,
            duplicateClaim: duplicateClaimRejection,
          },
        },
        refundedPool: {
          address: secondPool.toBase58(),
          vault: secondVault.toBase58(),
          createSignature: secondCreateSignature,
          joinSignature: secondJoinSignature,
          cancelSignature,
          refundSignature,
          remainingPoolAmount: secondPoolAccount.remainingPoolAmount.toString(),
          finalState: enumName(secondPoolAccount.state),
          vaultBalance: secondVaultAccount.amount.toString(),
          rejected: { duplicateRefund: duplicateRefundRejection },
        },
      },
      null,
      2,
    )}\n`,
  );
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
