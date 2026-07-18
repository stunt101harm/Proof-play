import {
  AnchorProvider,
  BN,
  Program,
  Wallet,
  type Idl,
} from "@coral-xyz/anchor";
import {
  ComputeBudgetProgram,
  Connection,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { PoolLifecycleState } from "@proof-play/domain";
import {
  TxlineAdapter,
  TxlineApiClient,
  getTxlineNetworkConfig,
} from "@proof-play/txline";
import {
  toAnchorStatValidationInputV3,
  txlineDailyScoresRootAddress,
} from "@proof-play/txline/proof";
import {
  loadKeypair,
  readStoredCredentials,
  requestGuestJwt,
} from "@proof-play/txline/server";

import type { KeeperDependencies, KeeperPool } from "./core";

const SETTLEMENT_COMPUTE_UNITS = 1_400_000;
const REPOSITORY_ROOT = fileURLToPath(new URL("../../../", import.meta.url));

type RawPool = {
  fixtureId: BN;
  state: unknown;
};

type RawSettlementConfig = {
  statKeys: number[];
  strategy: unknown;
};

function enumName(value: unknown): PoolLifecycleState {
  if (typeof value !== "object" || value === null) {
    throw new Error("ProofPlay returned an invalid pool state.");
  }
  const name = Object.keys(value)[0];
  if (
    !name ||
    ![
      "open",
      "locked",
      "settledYes",
      "settledNo",
      "cancelled",
      "closed",
    ].includes(name)
  ) {
    throw new Error(`ProofPlay returned unsupported pool state ${name}.`);
  }
  return name as PoolLifecycleState;
}

function settlementConfigAddress(programId: PublicKey, pool: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("settlement_config"), pool.toBuffer()],
    programId,
  )[0];
}

function settlementRecordAddress(programId: PublicKey, pool: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("settlement"), pool.toBuffer()],
    programId,
  )[0];
}

function vaultAddress(programId: PublicKey, pool: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), pool.toBuffer()],
    programId,
  )[0];
}

export async function createKeeperDependencies(
  environment: NodeJS.ProcessEnv = process.env,
): Promise<KeeperDependencies> {
  const walletPath =
    environment.KEEPER_WALLET_PATH ?? environment.PROOF_PLAY_WALLET_PATH;
  if (!walletPath) {
    throw new Error("KEEPER_WALLET_PATH is required for keeper fees.");
  }
  const rpcUrl =
    environment.PROOF_PLAY_RPC_URL ??
    environment.SOLANA_RPC_URL ??
    environment.NEXT_PUBLIC_SOLANA_RPC_URL ??
    "https://api.devnet.solana.com";
  const idlPath = resolve(
    REPOSITORY_ROOT,
    environment.PROOF_PLAY_IDL_PATH ?? "target/idl/proof_play.json",
  );
  const payer = await loadKeypair(resolve(REPOSITORY_ROOT, walletPath));
  const idl = JSON.parse(await readFile(idlPath, "utf8")) as Idl;
  const connection = new Connection(rpcUrl, "confirmed");
  const provider = new AnchorProvider(connection, new Wallet(payer), {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  });
  const program = new Program(idl, provider);
  const txlineConfig = getTxlineNetworkConfig("devnet", { rpcUrl });
  const credentials = await readStoredCredentials(
    txlineConfig,
    resolve(
      REPOSITORY_ROOT,
      environment.TXLINE_CREDENTIALS_PATH ?? ".txline/devnet-credentials.json",
    ),
  );
  const txlineClient = new TxlineApiClient(
    txlineConfig,
    { apiToken: credentials.apiToken, guestJwt: credentials.guestJwt },
    { renewGuestJwt: () => requestGuestJwt(txlineConfig) },
  );
  const txline = new TxlineAdapter(txlineClient);
  const poolAccounts = (
    program.account as unknown as {
      pool: {
        all(): Promise<Array<{ publicKey: PublicKey; account: RawPool }>>;
        fetch(address: PublicKey): Promise<RawPool>;
      };
      settlementConfig: {
        fetch(address: PublicKey): Promise<RawSettlementConfig>;
      };
    }
  ).pool;
  const settlementConfigAccounts = (
    program.account as unknown as {
      settlementConfig: {
        fetch(address: PublicKey): Promise<RawSettlementConfig>;
      };
    }
  ).settlementConfig;

  async function mapPool(
    address: PublicKey,
    account: RawPool,
  ): Promise<KeeperPool> {
    const state = enumName(account.state);
    let statKeys: number[] = [];
    let strategy: unknown = null;
    if (state === "locked") {
      const config = await settlementConfigAccounts.fetch(
        settlementConfigAddress(program.programId, address),
      );
      statKeys = [...config.statKeys];
      strategy = config.strategy;
    }
    return {
      poolAddress: address.toBase58(),
      fixtureId: account.fixtureId.toString(),
      state,
      statKeys,
      strategy,
    };
  }

  return {
    async listPools() {
      const accounts = await poolAccounts.all();
      return Promise.all(
        accounts.map(({ publicKey, account }) => mapPool(publicKey, account)),
      );
    },
    async loadPool(poolAddress) {
      const address = new PublicKey(poolAddress);
      return mapPool(address, await poolAccounts.fetch(address));
    },
    getHistoricalScores: (fixtureId) => txline.getHistoricalScores(fixtureId),
    getScoreProof: (input) => txline.getScoreProofV3(input),
    async submitSettlement({ pool, finalRecord, proof }) {
      const poolAddress = new PublicKey(pool.poolAddress);
      const txlineProgram = new PublicKey(txlineConfig.programId);
      const dailyScoresRoot = txlineDailyScoresRootAddress(
        proof.payload.ts,
        txlineProgram,
      );
      const signature = await program.methods
        .settlePool(
          toAnchorStatValidationInputV3(proof.payload),
          pool.strategy,
          new BN(finalRecord.sequence),
        )
        .accountsStrict({
          settler: payer.publicKey,
          pool: poolAddress,
          settlementConfig: settlementConfigAddress(
            program.programId,
            poolAddress,
          ),
          settlementRecord: settlementRecordAddress(
            program.programId,
            poolAddress,
          ),
          vault: vaultAddress(program.programId, poolAddress),
          dailyScoresRoot,
          txlineProgram,
          systemProgram: SystemProgram.programId,
        })
        .preInstructions([
          ComputeBudgetProgram.setComputeUnitLimit({
            units: SETTLEMENT_COMPUTE_UNITS,
          }),
        ])
        .rpc();
      const confirmation = await connection.confirmTransaction(
        signature,
        "finalized",
      );
      if (confirmation.value.err) {
        throw new Error(
          `Settlement ${signature} failed finalization: ${JSON.stringify(confirmation.value.err)}`,
        );
      }
      return { transactionSignature: signature };
    },
  };
}
