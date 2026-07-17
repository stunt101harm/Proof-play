import { AnchorProvider, Program, Wallet, type Idl } from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import nacl from "tweetnacl";
import { TXLINE_DEVNET_IDL } from "./devnet-idl";
import { TxlineDiagnosticError, txlineHttpError } from "./errors";
import {
  TXLINE_DEVNET_GENESIS_HASH,
  type TxlineNetworkConfig,
} from "./network";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddress,
} from "./token";

export const DEFAULT_TXLINE_CREDENTIALS_PATH =
  ".txline/devnet-credentials.json";

export type StoredTxlineCredentials = {
  version: 1;
  network: "devnet";
  apiOrigin: string;
  programId: string;
  tokenMint: string;
  walletPublicKey: string;
  subscriptionSignature: string;
  apiToken: string;
  guestJwt: string;
  activatedAt: string;
  guestJwtUpdatedAt: string;
};

type PricingRow = {
  rowId: number;
  pricePerWeekToken: { toString(): string };
  samplingIntervalSec: number;
};

function parseTokenResponse(value: unknown, label: string) {
  const token =
    typeof value === "string"
      ? value
      : typeof value === "object" && value !== null && "token" in value
        ? (value as { token?: unknown }).token
        : undefined;

  if (typeof token !== "string" || token.length === 0) {
    throw new TxlineDiagnosticError({
      code: "TXLINE_INVALID_RESPONSE",
      message: `TxLINE ${label} response did not contain a token.`,
      hint: "Confirm the devnet API host and inspect a redacted response body.",
    });
  }

  return token;
}

async function postJson(url: URL, body?: unknown, authorization?: string) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(authorization ? { Authorization: authorization } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!response.ok) {
    throw txlineHttpError(url.pathname, response.status, await response.text());
  }

  const responseBody = await response.text();
  if (!responseBody) return undefined;

  try {
    return JSON.parse(responseBody) as unknown;
  } catch {
    return responseBody;
  }
}

export function activationMessage(
  transactionSignature: string,
  selectedLeagues: number[],
  guestJwt: string,
) {
  return `${transactionSignature}:${selectedLeagues.join(",")}:${guestJwt}`;
}

export function signActivationMessage(
  transactionSignature: string,
  selectedLeagues: number[],
  guestJwt: string,
  secretKey: Uint8Array,
) {
  const message = new TextEncoder().encode(
    activationMessage(transactionSignature, selectedLeagues, guestJwt),
  );
  return Buffer.from(nacl.sign.detached(message, secretKey)).toString("base64");
}

export async function loadKeypair(walletPath: string) {
  const resolvedPath = resolve(walletPath);
  const contents = await readFile(resolvedPath, "utf8");
  const parsed = JSON.parse(contents) as unknown;

  if (
    !Array.isArray(parsed) ||
    parsed.length !== 64 ||
    parsed.some((value) => !Number.isInteger(value) || value < 0 || value > 255)
  ) {
    throw new Error(`Invalid Solana keypair file: ${resolvedPath}`);
  }

  return Keypair.fromSecretKey(Uint8Array.from(parsed));
}

export async function assertDevnetConnection(
  connection: Connection,
  config: TxlineNetworkConfig,
) {
  const genesisHash = await connection.getGenesisHash();

  if (genesisHash !== TXLINE_DEVNET_GENESIS_HASH) {
    throw new TxlineDiagnosticError({
      code: "TXLINE_NETWORK_MISMATCH",
      message: `RPC genesis hash ${genesisHash} is not Solana devnet.`,
      hint: `Use a devnet RPC with TxLINE program ${config.programId} and API host ${config.apiOrigin}.`,
    });
  }

  const program = await connection.getAccountInfo(
    new PublicKey(config.programId),
  );
  if (!program?.executable) {
    throw new TxlineDiagnosticError({
      code: "TXLINE_NETWORK_MISMATCH",
      message: `TxLINE program ${config.programId} is not executable on the configured RPC.`,
      hint: "Check the RPC network and TxLINE devnet program ID.",
    });
  }

  return genesisHash;
}

export async function requestGuestJwt(config: TxlineNetworkConfig) {
  const response = await postJson(
    new URL("/auth/guest/start", config.apiOrigin),
  );
  return parseTokenResponse(response, "guest authentication");
}

export async function writeStoredCredentials(
  credentials: StoredTxlineCredentials,
  credentialsPath = DEFAULT_TXLINE_CREDENTIALS_PATH,
) {
  const resolvedPath = resolve(credentialsPath);
  await mkdir(dirname(resolvedPath), { recursive: true, mode: 0o700 });
  await writeFile(resolvedPath, `${JSON.stringify(credentials, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await chmod(resolvedPath, 0o600);
  return resolvedPath;
}

export async function readStoredCredentials(
  config: TxlineNetworkConfig,
  credentialsPath = DEFAULT_TXLINE_CREDENTIALS_PATH,
) {
  const parsed = JSON.parse(
    await readFile(resolve(credentialsPath), "utf8"),
  ) as StoredTxlineCredentials;

  if (
    parsed.version !== 1 ||
    parsed.network !== "devnet" ||
    parsed.apiOrigin !== config.apiOrigin ||
    parsed.programId !== config.programId ||
    parsed.tokenMint !== config.tokenMint ||
    !parsed.apiToken ||
    !parsed.guestJwt
  ) {
    throw new TxlineDiagnosticError({
      code: "TXLINE_NETWORK_MISMATCH",
      message:
        "Stored TxLINE credentials do not match the devnet configuration.",
      hint: "Remove the local credentials file and run txline:activate again.",
    });
  }

  return parsed;
}

export async function renewStoredGuestJwt(
  config: TxlineNetworkConfig,
  credentialsPath = DEFAULT_TXLINE_CREDENTIALS_PATH,
) {
  const credentials = await readStoredCredentials(config, credentialsPath);
  credentials.guestJwt = await requestGuestJwt(config);
  credentials.guestJwtUpdatedAt = new Date().toISOString();
  await writeStoredCredentials(credentials, credentialsPath);
  return credentials;
}

async function prepareDevnetSubscription(
  config: TxlineNetworkConfig,
  walletPath: string,
) {
  const payer = await loadKeypair(walletPath);
  const connection = new Connection(config.rpcUrl, "confirmed");
  const genesisHash = await assertDevnetConnection(connection, config);
  const wallet = new Wallet(payer);
  const provider = new AnchorProvider(connection, wallet, {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  });
  const program = new Program(TXLINE_DEVNET_IDL as unknown as Idl, provider);

  if (program.programId.toBase58() !== config.programId) {
    throw new TxlineDiagnosticError({
      code: "TXLINE_NETWORK_MISMATCH",
      message: `Loaded IDL program ${program.programId.toBase58()} does not match ${config.programId}.`,
      hint: "Use the checked-in TxLINE devnet subscription IDL.",
    });
  }

  const [pricingMatrixPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("pricing_matrix")],
    program.programId,
  );
  const pricingMatrix = (await (
    program.account as unknown as {
      pricingMatrix: {
        fetch(address: PublicKey): Promise<{ rows: PricingRow[] }>;
      };
    }
  ).pricingMatrix.fetch(pricingMatrixPda)) as { rows: PricingRow[] };
  const freeRow = pricingMatrix.rows.find(
    (row) => Number(row.rowId) === config.freeServiceLevelId,
  );

  if (!freeRow || BigInt(freeRow.pricePerWeekToken.toString()) !== 0n) {
    throw new TxlineDiagnosticError({
      code: "TXLINE_NETWORK_MISMATCH",
      message: `TxLINE devnet service level ${config.freeServiceLevelId} is missing or no longer free.`,
      hint: "Inspect the current on-chain pricing matrix before subscribing.",
    });
  }

  return {
    balanceLamports: await connection.getBalance(payer.publicKey, "confirmed"),
    connection,
    freeRow,
    genesisHash,
    payer,
    pricingMatrixPda,
    program,
    tokenMint: new PublicKey(config.tokenMint),
  };
}

export async function inspectDevnetSubscription(
  config: TxlineNetworkConfig,
  walletPath: string,
) {
  const prepared = await prepareDevnetSubscription(config, walletPath);
  return {
    balanceLamports: prepared.balanceLamports,
    genesisHash: prepared.genesisHash,
    samplingIntervalSec: Number(prepared.freeRow.samplingIntervalSec),
    serviceLevelId: config.freeServiceLevelId,
    walletPublicKey: prepared.payer.publicKey.toBase58(),
  };
}

async function activateApiToken(options: {
  config: TxlineNetworkConfig;
  credentialsPath: string;
  payer: Keypair;
  transactionSignature: string;
}) {
  const { config, credentialsPath, payer, transactionSignature } = options;
  const guestJwt = await requestGuestJwt(config);
  const walletSignature = signActivationMessage(
    transactionSignature,
    config.selectedLeagues,
    guestJwt,
    payer.secretKey,
  );
  const activation = await postJson(
    new URL("/api/token/activate", config.apiOrigin),
    {
      txSig: transactionSignature,
      walletSignature,
      leagues: config.selectedLeagues,
    },
    `Bearer ${guestJwt}`,
  );
  const now = new Date().toISOString();
  const credentials: StoredTxlineCredentials = {
    version: 1,
    network: "devnet",
    apiOrigin: config.apiOrigin,
    programId: config.programId,
    tokenMint: config.tokenMint,
    walletPublicKey: payer.publicKey.toBase58(),
    subscriptionSignature: transactionSignature,
    apiToken: parseTokenResponse(activation, "activation"),
    guestJwt,
    activatedAt: now,
    guestJwtUpdatedAt: now,
  };
  await writeStoredCredentials(credentials, credentialsPath);
  return credentials;
}

export async function activateExistingDevnetSubscription(options: {
  config: TxlineNetworkConfig;
  walletPath: string;
  transactionSignature: string;
  credentialsPath?: string;
}) {
  const connection = new Connection(options.config.rpcUrl, "confirmed");
  await assertDevnetConnection(connection, options.config);
  const payer = await loadKeypair(options.walletPath);
  return activateApiToken({
    config: options.config,
    credentialsPath: options.credentialsPath ?? DEFAULT_TXLINE_CREDENTIALS_PATH,
    payer,
    transactionSignature: options.transactionSignature,
  });
}

export async function activateDevnetAccess(options: {
  config: TxlineNetworkConfig;
  walletPath: string;
  credentialsPath?: string;
}) {
  const { config, walletPath } = options;
  const credentialsPath =
    options.credentialsPath ?? DEFAULT_TXLINE_CREDENTIALS_PATH;
  const {
    balanceLamports,
    connection,
    freeRow,
    payer,
    pricingMatrixPda,
    program,
    tokenMint,
  } = await prepareDevnetSubscription(config, walletPath);

  if (balanceLamports < 1_000_000) {
    throw new Error(
      `Wallet ${payer.publicKey.toBase58()} needs devnet SOL before TxLINE activation.`,
    );
  }

  const userTokenAccount = getAssociatedTokenAddress(
    tokenMint,
    payer.publicKey,
  );

  if (!(await connection.getAccountInfo(userTokenAccount, "confirmed"))) {
    const createTokenAccount =
      createAssociatedTokenAccountIdempotentInstruction(
        payer.publicKey,
        userTokenAccount,
        payer.publicKey,
        tokenMint,
      );
    await sendAndConfirmTransaction(
      connection,
      new Transaction().add(createTokenAccount),
      [payer],
      { commitment: "confirmed" },
    );
  }

  const [tokenTreasuryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("token_treasury_v2")],
    program.programId,
  );
  const tokenTreasuryVault = getAssociatedTokenAddress(
    tokenMint,
    tokenTreasuryPda,
    true,
  );

  const transactionSignature = await program.methods
    .subscribe(config.freeServiceLevelId, config.durationWeeks)
    .accounts({
      user: payer.publicKey,
      pricingMatrix: pricingMatrixPda,
      tokenMint,
      userTokenAccount,
      tokenTreasuryVault,
      tokenTreasuryPda,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
    })
    .rpc();

  const credentials = await activateApiToken({
    config,
    credentialsPath,
    payer,
    transactionSignature,
  });

  return {
    balanceLamports,
    credentials,
    credentialsPath: resolve(credentialsPath),
    pricing: {
      samplingIntervalSec: Number(freeRow.samplingIntervalSec),
      serviceLevelId: config.freeServiceLevelId,
    },
  };
}
