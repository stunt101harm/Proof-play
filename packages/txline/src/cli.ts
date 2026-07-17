import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { TxlineDiagnosticError } from "./errors";
import { getTxlineNetworkConfig } from "./network";
import {
  DEFAULT_TXLINE_CREDENTIALS_PATH,
  activateDevnetAccess,
  activateExistingDevnetSubscription,
  inspectDevnetSubscription,
  loadKeypair,
  readStoredCredentials,
  renewStoredGuestJwt,
  writeStoredCredentials,
} from "./server";
import { verifyTxlineDataPaths } from "./verification";

try {
  process.loadEnvFile();
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}

const command = process.argv[2] ?? "help";
const walletPath =
  process.env.TXLINE_WALLET_PATH ??
  process.env.ANCHOR_WALLET ??
  "txline-devnet-keypair.json";
const credentialsPath =
  process.env.TXLINE_CREDENTIALS_PATH ?? DEFAULT_TXLINE_CREDENTIALS_PATH;
const reportPath =
  process.env.TXLINE_VERIFICATION_REPORT_PATH ??
  ".txline/verification-report.json";
const config = getTxlineNetworkConfig("devnet", {
  rpcUrl:
    process.env.SOLANA_RPC_URL ??
    process.env.ANCHOR_PROVIDER_URL ??
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL,
  apiOrigin: process.env.TXLINE_API_ORIGIN,
  programId: process.env.TXLINE_PROGRAM_ID,
  tokenMint: process.env.TXLINE_TOKEN_MINT,
});

async function saveReport(report: unknown) {
  const absolutePath = resolve(reportPath);
  await mkdir(dirname(absolutePath), { recursive: true, mode: 0o700 });
  await writeFile(absolutePath, `${JSON.stringify(report, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  return absolutePath;
}

async function run() {
  if (command === "address") {
    const payer = await loadKeypair(walletPath);
    console.log(payer.publicKey.toBase58());
    return;
  }

  if (command === "diagnose") {
    const inspection = await inspectDevnetSubscription(config, walletPath);
    console.log(
      JSON.stringify(
        {
          network: config.network,
          rpcUrl: config.rpcUrl,
          genesisHash: inspection.genesisHash,
          apiOrigin: config.apiOrigin,
          programId: config.programId,
          tokenMint: config.tokenMint,
          serviceLevelId: inspection.serviceLevelId,
          samplingIntervalSec: inspection.samplingIntervalSec,
          walletPublicKey: inspection.walletPublicKey,
          balanceLamports: inspection.balanceLamports,
          funded: inspection.balanceLamports >= 1_000_000,
        },
        null,
        2,
      ),
    );
    return;
  }

  if (command === "activate") {
    const result = await activateDevnetAccess({
      config,
      walletPath,
      credentialsPath,
    });
    console.log(
      JSON.stringify(
        {
          network: config.network,
          walletPublicKey: result.credentials.walletPublicKey,
          subscriptionSignature: result.credentials.subscriptionSignature,
          serviceLevelId: result.pricing.serviceLevelId,
          samplingIntervalSec: result.pricing.samplingIntervalSec,
          credentialsSaved: true,
        },
        null,
        2,
      ),
    );
    return;
  }

  if (command === "recover") {
    const transactionSignature =
      process.argv[3] ?? process.env.TXLINE_SUBSCRIPTION_SIGNATURE;
    if (!transactionSignature) {
      throw new Error(
        "Pass the confirmed subscription signature after `npm run txline:recover --`.",
      );
    }
    const credentials = await activateExistingDevnetSubscription({
      config,
      walletPath,
      transactionSignature,
      credentialsPath,
    });
    console.log(
      JSON.stringify(
        {
          network: config.network,
          walletPublicKey: credentials.walletPublicKey,
          subscriptionSignature: credentials.subscriptionSignature,
          credentialsSaved: true,
          recovered: true,
        },
        null,
        2,
      ),
    );
    return;
  }

  if (command === "renew") {
    const credentials = await renewStoredGuestJwt(config, credentialsPath);
    console.log(
      JSON.stringify(
        {
          network: config.network,
          walletPublicKey: credentials.walletPublicKey,
          guestJwtUpdatedAt: credentials.guestJwtUpdatedAt,
          apiTokenReused: true,
        },
        null,
        2,
      ),
    );
    return;
  }

  if (command === "verify") {
    const credentials = await readStoredCredentials(config, credentialsPath);
    const previousJwt = credentials.guestJwt;
    const report = await verifyTxlineDataPaths({
      config,
      credentials,
      fixtureCompetitionId: Number(
        process.env.TXLINE_FIXTURE_COMPETITION_ID ?? 72,
      ),
      fixtureStartEpochDay: process.env.TXLINE_FIXTURE_START_EPOCH_DAY
        ? Number(process.env.TXLINE_FIXTURE_START_EPOCH_DAY)
        : undefined,
      sseTimeoutMs: Number(process.env.TXLINE_SSE_TIMEOUT_MS ?? 15_000),
    });
    if (credentials.guestJwt !== previousJwt) {
      credentials.guestJwtUpdatedAt = new Date().toISOString();
      await writeStoredCredentials(credentials, credentialsPath);
    }
    const savedTo = await saveReport(report);
    console.log(JSON.stringify({ ...report, reportSaved: savedTo }, null, 2));
    return;
  }

  console.log(`ProofPlay TxLINE devnet commands:
  address   Print the dedicated wallet public key
  diagnose  Validate network consistency and wallet funding
  activate  Subscribe to the free tier and save activated credentials locally
  recover   Activate an already-confirmed subscription transaction
  renew     Renew the guest JWT while reusing the activated API token
  verify    Exercise fixtures, odds, historical scores, scores SSE, and proofs`);
}

run().catch((error: unknown) => {
  if (error instanceof TxlineDiagnosticError) {
    console.error(`[${error.code}] ${error.message}`);
    console.error(`Hint: ${error.hint}`);
  } else {
    console.error(
      error instanceof Error ? error.message : "Unknown TxLINE error",
    );
  }
  process.exitCode = 1;
});
