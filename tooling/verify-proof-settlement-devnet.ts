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
  ComputeBudgetProgram,
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { compileCondition } from "@proof-play/condition-engine";
import {
  TXLINE_DEVNET_GENESIS_HASH,
  TxlineAdapter,
  TxlineApiClient,
  getTxlineNetworkConfig,
  type TxlineScoreProofV3,
} from "@proof-play/txline";
import {
  readStoredCredentials,
  requestGuestJwt,
} from "@proof-play/txline/server";

const RPC_URL =
  process.env.PROOF_PLAY_RPC_URL ?? "https://api.devnet.solana.com";
const WALLET_PATH = process.env.PROOF_PLAY_WALLET_PATH;
const IDL_PATH = resolve("target/idl/proof_play.json");
const EVIDENCE_PATH = resolve(
  process.env.PROOF_PLAY_EVIDENCE_PATH ??
    "docs/evidence/proof-settlement-devnet-verification.json",
);
const FIXTURE_ID = "18241006";
const FINAL_SEQUENCE = 962;
const FINAL_PERIOD = 100;
const TOKEN_DECIMALS = 6;
const UNIT = 10 ** TOKEN_DECIMALS;
const MIN_SETTLEMENT_GRACE_SECONDS = 3_600;
const MAX_TRANSACTION_BYTES = 1_232;
const SETTLEMENT_COMPUTE_UNITS = 1_400_000;

if (!WALLET_PATH) {
  throw new Error(
    "PROOF_PLAY_WALLET_PATH is required; point it to the funded devnet deployer keypair.",
  );
}

type PoolSnapshot = {
  state: unknown;
  winningSide: unknown;
  yesAmount: BN;
  noAmount: BN;
  settledSequence: BN;
  remainingPoolAmount: BN;
  remainingWinningStake: BN;
};

type SettlementRecordSnapshot = {
  pool: PublicKey;
  conditionCommitment: number[];
  compilerVersion: number;
  txlineProgram: PublicKey;
  dailyScoresRoot: PublicKey;
  proofTimestampMs: BN;
  observedSequence: BN;
  eventStatRoot: number[];
  statKeys: number[];
  statValues: number[];
  statPeriods: number[];
  statCount: number;
  predicateResult: boolean;
  winningSide: unknown;
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

function pda(programId: PublicKey, seed: string, address: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(seed), address.toBuffer()],
    programId,
  )[0];
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

function dailyScoresRootAddress(programId: PublicKey, timestampMs: number) {
  const epochDay = Math.floor(timestampMs / 86_400_000);
  if (epochDay < 0 || epochDay > 0xffff) {
    throw new Error(`Proof epoch day ${epochDay} does not fit in a u16.`);
  }
  const epochBytes = Buffer.alloc(2);
  epochBytes.writeUInt16LE(epochDay);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("daily_scores_roots"), epochBytes],
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
    typeof candidate.message === "string" ? candidate.message : String(error);
  return message.match(/Error Code: ([A-Za-z0-9]+)/)?.[1] ?? null;
}

function failureSummary(error: unknown) {
  const code = anchorErrorCode(error);
  if (code) return code;
  const message = error instanceof Error ? error.message : String(error);
  const custom = message.match(/custom program error: (0x[0-9a-f]+)/i)?.[1];
  if (custom === "0x0") return "AccountAlreadyInitialized";
  return custom
    ? `CustomProgram-${custom}`
    : message.split("\n")[0]!.slice(0, 160);
}

async function expectFailure(
  operation: () => Promise<unknown>,
  label: string,
  expectedCodes: string[] = [],
) {
  try {
    await operation();
  } catch (error) {
    const summary = failureSummary(error);
    if (expectedCodes.length > 0 && !expectedCodes.includes(summary)) {
      throw new Error(
        `${label} failed with ${summary}, expected ${expectedCodes}.`,
      );
    }
    return summary;
  }
  throw new Error(`${label} unexpectedly succeeded.`);
}

async function chainTimestamp(connection: Connection): Promise<number> {
  const slot = await connection.getSlot("confirmed");
  const timestamp = await connection.getBlockTime(slot);
  if (timestamp === null)
    throw new Error("Devnet did not return a block time.");
  return timestamp;
}

async function waitForTimestamp(connection: Connection, target: number) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if ((await chainTimestamp(connection)) >= target) return;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 1_500));
  }
  throw new Error(`Devnet clock did not reach ${target} before timeout.`);
}

function clonePayload(proof: TxlineScoreProofV3) {
  return structuredClone(proof.payload);
}

function anchorPayload(payload: TxlineScoreProofV3["payload"]) {
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

async function main() {
  const deployer = await loadKeypair(WALLET_PATH!);
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
  const txlineConfig = getTxlineNetworkConfig("devnet", { rpcUrl: RPC_URL });
  const stored = await readStoredCredentials(txlineConfig);
  const txlineClient = new TxlineApiClient(
    txlineConfig,
    { apiToken: stored.apiToken, guestJwt: stored.guestJwt },
    { renewGuestJwt: () => requestGuestJwt(txlineConfig) },
  );
  const txline = new TxlineAdapter(txlineClient);

  const finalRecords = await txline.getHistoricalScores(FIXTURE_ID);
  const finalRecord = finalRecords.find(
    (record) => record.sequence === FINAL_SEQUENCE,
  );
  if (
    !finalRecord ||
    !finalRecord.isFinal ||
    finalRecord.action !== "game_finalised" ||
    finalRecord.statusId !== 100
  ) {
    throw new Error(
      `Sequence ${FINAL_SEQUENCE} is not a game_finalised/status 100 record.`,
    );
  }
  const compiled = await compileCondition({
    version: 1,
    fixtureId: FIXTURE_ID,
    operator: "all",
    legs: [
      { kind: "participantWins", participant: 2 },
      { kind: "totalCorners", comparison: "atMost", threshold: 7 },
    ],
  });
  const proof = await txline.getScoreProofV3({
    fixtureId: FIXTURE_ID,
    sequence: FINAL_SEQUENCE,
    statKeys: compiled.statKeys,
  });
  if (proof.payload.leaves.some((leaf) => leaf.stat.period !== FINAL_PERIOD)) {
    throw new Error("TxLINE returned a non-final stat leaf for settlement.");
  }

  const txlineProgram = new PublicKey(txlineConfig.programId);
  const dailyScoresRoot = dailyScoresRootAddress(
    txlineProgram,
    proof.payload.ts,
  );
  const rootAccount = await connection.getAccountInfo(dailyScoresRoot);
  if (!rootAccount?.owner.equals(txlineProgram)) {
    throw new Error(`Daily root ${dailyScoresRoot} is not owned by TxLINE.`);
  }

  if (process.env.PROOF_PLAY_PREFLIGHT_ONLY === "1") {
    const placeholderPool = Keypair.generate().publicKey;
    const placeholderInstruction = await program.methods
      .settlePool(
        anchorPayload(proof.payload),
        compiled.strategy,
        new BN(FINAL_SEQUENCE),
      )
      .accountsStrict({
        settler: deployer.publicKey,
        pool: placeholderPool,
        settlementConfig: pda(
          program.programId,
          "settlement_config",
          placeholderPool,
        ),
        settlementRecord: pda(program.programId, "settlement", placeholderPool),
        vault: pda(program.programId, "vault", placeholderPool),
        dailyScoresRoot,
        txlineProgram,
        systemProgram: SystemProgram.programId,
      })
      .instruction();
    const latestBlockhash = await connection.getLatestBlockhash("confirmed");
    const transaction = new Transaction({
      feePayer: deployer.publicKey,
      recentBlockhash: latestBlockhash.blockhash,
    }).add(
      ComputeBudgetProgram.setComputeUnitLimit({
        units: SETTLEMENT_COMPUTE_UNITS,
      }),
      placeholderInstruction,
    );
    transaction.sign(deployer);
    const transactionBytes = transaction.serialize().length;
    if (transactionBytes > MAX_TRANSACTION_BYTES) {
      throw new Error(
        `Settlement transaction is ${transactionBytes} bytes; limit is ${MAX_TRANSACTION_BYTES}.`,
      );
    }
    process.stdout.write(
      `${JSON.stringify(
        {
          network: "devnet",
          fixtureId: FIXTURE_ID,
          sequence: FINAL_SEQUENCE,
          statKeys: compiled.statKeys,
          statPeriods: proof.payload.leaves.map((leaf) => leaf.stat.period),
          dailyScoresRoot: dailyScoresRoot.toBase58(),
          fixtureProofNodes: proof.payload.fixtureProof.length,
          mainTreeProofNodes: proof.payload.mainTreeProof.length,
          multiproofHashNodes: proof.payload.multiproofHashes.length,
          transactionBytes,
          maxTransactionBytes: MAX_TRANSACTION_BYTES,
        },
        null,
        2,
      )}\n`,
    );
    return;
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
  const yesTokens = await getOrCreateAssociatedTokenAccount(
    connection,
    deployer,
    mint,
    deployer.publicKey,
  );
  const noTokens = await getOrCreateAssociatedTokenAccount(
    connection,
    deployer,
    mint,
    participant.publicKey,
  );
  await mintTo(
    connection,
    deployer,
    mint,
    yesTokens.address,
    deployer,
    4 * UNIT,
  );
  await mintTo(
    connection,
    deployer,
    mint,
    noTokens.address,
    deployer,
    6 * UNIT,
  );

  const poolId = new BN(Date.now().toString());
  const pool = poolAddress(program.programId, deployer.publicKey, poolId);
  const vault = pda(program.programId, "vault", pool);
  const settlementConfig = pda(program.programId, "settlement_config", pool);
  const settlementRecord = pda(program.programId, "settlement", pool);
  const yesPosition = positionAddress(
    program.programId,
    pool,
    deployer.publicKey,
  );
  const noPosition = positionAddress(
    program.programId,
    pool,
    participant.publicKey,
  );
  const now = await chainTimestamp(connection);
  const cutoff = now + 15;
  const refundAfter = cutoff + MIN_SETTLEMENT_GRACE_SECONDS;
  const settlementAccounts = {
    settler: deployer.publicKey,
    pool,
    settlementConfig,
    settlementRecord,
    vault,
    dailyScoresRoot,
    txlineProgram,
    systemProgram: SystemProgram.programId,
  };
  const computeInstruction = ComputeBudgetProgram.setComputeUnitLimit({
    units: SETTLEMENT_COMPUTE_UNITS,
  });

  const createSignature = await program.methods
    .createPool(
      {
        poolId,
        fixtureId: new BN(compiled.fixtureId),
        conditionCommitment: Array.from(compiled.conditionCommitment),
        compilerVersion: compiled.compilerVersion,
        cutoffUnixSeconds: new BN(cutoff),
        refundAfterUnixSeconds: new BN(refundAfter),
        demoMode: false,
      },
      { statKeys: compiled.statKeys, strategy: compiled.strategy },
    )
    .accountsStrict({
      creator: deployer.publicKey,
      pool,
      vault,
      settlementConfig,
      tokenMint: mint,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  const yesJoinSignature = await program.methods
    .joinPool({ yes: {} }, new BN(4 * UNIT))
    .accountsStrict({
      participant: deployer.publicKey,
      pool,
      vault,
      tokenMint: mint,
      participantTokens: yesTokens.address,
      position: yesPosition,
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
  const noJoinSignature = await participantProgram.methods
    .joinPool({ no: {} }, new BN(6 * UNIT))
    .accountsStrict({
      participant: participant.publicKey,
      pool,
      vault,
      tokenMint: mint,
      participantTokens: noTokens.address,
      position: noPosition,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  await waitForTimestamp(connection, cutoff);
  const lockSignature = await program.methods
    .lockPool()
    .accountsStrict({ pool })
    .rpc();

  const settleAttempt = (
    candidate: TxlineScoreProofV3["payload"],
    strategy: unknown = compiled.strategy,
    root: PublicKey = dailyScoresRoot,
  ) =>
    program.methods
      .settlePool(anchorPayload(candidate), strategy, new BN(FINAL_SEQUENCE))
      .accountsStrict({ ...settlementAccounts, dailyScoresRoot: root })
      .preInstructions([computeInstruction])
      .rpc();

  const alteredFixture = clonePayload(proof);
  alteredFixture.fixtureSummary.fixtureId = String(Number(FIXTURE_ID) + 1);
  const alteredPeriod = clonePayload(proof);
  alteredPeriod.leaves[0]!.stat.period = 0;
  const alteredValue = clonePayload(proof);
  alteredValue.leaves[0]!.stat.value += 1;
  const alteredProof = clonePayload(proof);
  alteredProof.eventStatRoot[0] ^= 1;
  const alteredTimestamp = clonePayload(proof);
  alteredTimestamp.ts += 1;
  const alteredStrategy = structuredClone(compiled.strategy);
  const strategyPredicate = alteredStrategy.discretePredicates[1]!;
  if (!("binary" in strategyPredicate)) {
    throw new Error("Expected the compiled corners predicate to be binary.");
  }
  strategyPredicate.binary.predicate.threshold += 1;

  const rejected = {
    demoHook: await expectFailure(
      () =>
        program.methods
          .recordDemoOutcome({ yes: {} }, new BN(FINAL_SEQUENCE))
          .accountsStrict({ creator: deployer.publicKey, pool, vault })
          .rpc(),
      "production demo hook",
      ["UnverifiedSettlementDisabled"],
    ),
    fixture: await expectFailure(
      () => settleAttempt(alteredFixture),
      "altered fixture",
      ["SettlementFixtureMismatch"],
    ),
    period: await expectFailure(
      () => settleAttempt(alteredPeriod),
      "non-final period",
      ["NonFinalSettlementProof"],
    ),
    timestamp: await expectFailure(
      () => settleAttempt(alteredTimestamp),
      "altered timestamp",
      ["InvalidProofTimestamp"],
    ),
    strategy: await expectFailure(
      () => settleAttempt(proof.payload, alteredStrategy),
      "altered strategy",
      ["SettlementStrategyMismatch"],
    ),
    root: await expectFailure(
      () =>
        settleAttempt(
          proof.payload,
          compiled.strategy,
          SystemProgram.programId,
        ),
      "altered daily root",
      ["InvalidDailyScoresRoot"],
    ),
    statValue: await expectFailure(
      () => settleAttempt(alteredValue),
      "altered stat value",
    ),
    merkleProof: await expectFailure(
      () => settleAttempt(alteredProof),
      "altered Merkle proof",
    ),
  };

  const poolAccounts = (
    program.account as unknown as {
      pool: { fetch(address: PublicKey): Promise<PoolSnapshot> };
    }
  ).pool;
  const lockedPool = await poolAccounts.fetch(pool);
  if (
    enumName(lockedPool.state) !== "locked" ||
    !lockedPool.settledSequence.isZero() ||
    (await connection.getAccountInfo(settlementRecord)) !== null
  ) {
    throw new Error("A rejected settlement changed on-chain pool state.");
  }

  const settleInstruction = await program.methods
    .settlePool(
      anchorPayload(proof.payload),
      compiled.strategy,
      new BN(FINAL_SEQUENCE),
    )
    .accountsStrict(settlementAccounts)
    .instruction();
  const latestBlockhash = await connection.getLatestBlockhash("confirmed");
  const settleTransaction = new Transaction({
    feePayer: deployer.publicKey,
    recentBlockhash: latestBlockhash.blockhash,
  }).add(computeInstruction, settleInstruction);
  settleTransaction.sign(deployer);
  const transactionBytes = settleTransaction.serialize().length;
  if (transactionBytes > MAX_TRANSACTION_BYTES) {
    throw new Error(
      `Settlement transaction is ${transactionBytes} bytes; limit is ${MAX_TRANSACTION_BYTES}.`,
    );
  }
  const simulation = await connection.simulateTransaction(settleTransaction);
  if (simulation.value.err) {
    throw new Error(
      `Valid settlement simulation failed: ${JSON.stringify(simulation.value.err)}`,
    );
  }
  const settleSignature = await sendAndConfirmTransaction(
    connection,
    settleTransaction,
    [deployer],
    { commitment: "confirmed" },
  );
  const replay = await expectFailure(
    () => settleAttempt(proof.payload),
    "settlement replay",
  );

  const recordAccounts = (
    program.account as unknown as {
      settlementRecord: {
        fetch(address: PublicKey): Promise<SettlementRecordSnapshot>;
      };
    }
  ).settlementRecord;
  const record = await recordAccounts.fetch(settlementRecord);
  if (
    !record.pool.equals(pool) ||
    record.observedSequence.toNumber() !== FINAL_SEQUENCE ||
    record.proofTimestampMs.toNumber() !== proof.payload.ts ||
    !record.txlineProgram.equals(txlineProgram) ||
    !record.dailyScoresRoot.equals(dailyScoresRoot) ||
    !record.predicateResult ||
    enumName(record.winningSide) !== "yes"
  ) {
    throw new Error("Settlement receipt does not match the proven outcome.");
  }
  const claimSignature = await program.methods
    .claim()
    .accountsStrict({
      owner: deployer.publicKey,
      pool,
      position: yesPosition,
      vault,
      tokenMint: mint,
      destinationTokens: yesTokens.address,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc();
  const finalPool = await poolAccounts.fetch(pool);
  const finalVault = await getAccount(connection, vault);

  const evidence = {
    verifiedAt: new Date().toISOString(),
    network: "devnet",
    rpcGenesisHash: genesisHash,
    programId: program.programId.toBase58(),
    txlineProgramId: txlineProgram.toBase58(),
    deployer: deployer.publicKey.toBase58(),
    participant: participant.publicKey.toBase58(),
    fixture: {
      fixtureId: FIXTURE_ID,
      action: finalRecord.action,
      statusId: finalRecord.statusId,
      period: finalRecord.period,
      sequence: finalRecord.sequence,
    },
    condition: {
      compilerVersion: compiled.compilerVersion,
      validationMethod: compiled.validationMethod,
      conditionCommitmentHex: compiled.conditionCommitmentHex,
      statKeys: compiled.statKeys,
      statement: compiled.humanStatement,
      legs: compiled.compiledLegs.map((leg) => leg.humanStatement),
    },
    proof: {
      timestampMs: proof.payload.ts,
      dailyScoresRoot: dailyScoresRoot.toBase58(),
      eventStatRoot: Buffer.from(proof.payload.eventStatRoot).toString("hex"),
      stats: proof.payload.leaves.map((leaf) => leaf.stat),
      fixtureProofNodes: proof.payload.fixtureProof.length,
      mainTreeProofNodes: proof.payload.mainTreeProof.length,
      multiproofHashNodes: proof.payload.multiproofHashes.length,
      leafIndices: proof.payload.leafIndices,
    },
    pool: {
      address: pool.toBase58(),
      vault: vault.toBase58(),
      settlementConfig: settlementConfig.toBase58(),
      settlementRecord: settlementRecord.toBase58(),
      tokenMint: mint.toBase58(),
      createSignature,
      yesJoinSignature,
      noJoinSignature,
      lockSignature,
      settleSignature,
      claimSignature,
      participantFundingSignature,
      finalState: enumName(finalPool.state),
      vaultBalance: finalVault.amount.toString(),
      yesAmount: finalPool.yesAmount.toString(),
      noAmount: finalPool.noAmount.toString(),
      winningStake: (4 * UNIT).toString(),
      winnerClaimedAmount: (10 * UNIT).toString(),
      tokenDecimals: TOKEN_DECIMALS,
    },
    settlement: {
      permissionlessSettler: deployer.publicKey.toBase58(),
      predicateResult: record.predicateResult,
      winningSide: enumName(record.winningSide),
      observedSequence: record.observedSequence.toString(),
      transactionBytes,
      maxTransactionBytes: MAX_TRANSACTION_BYTES,
      computeUnitLimit: SETTLEMENT_COMPUTE_UNITS,
      computeUnitsConsumed: simulation.value.unitsConsumed ?? null,
      replayRejectedAs: replay,
    },
    rejected,
    trustBoundary: {
      sequence:
        "Observed API metadata; TxLINE V3 commits the selected event root but does not include sequence in its on-chain payload.",
      finality:
        "The verifier binds game_finalised/statusId 100 off-chain; the program independently requires every proven stat leaf to use period 100.",
    },
  };
  await writeFile(
    EVIDENCE_PATH,
    `${JSON.stringify(evidence, null, 2)}\n`,
    "utf8",
  );
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
}

void main();
