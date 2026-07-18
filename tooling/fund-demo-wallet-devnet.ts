import {
  getMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { TXLINE_DEVNET_GENESIS_HASH } from "@proof-play/txline";

const RPC_URL =
  process.env.PROOF_PLAY_RPC_URL ?? "https://api.devnet.solana.com";
const WALLET_PATH = process.env.PROOF_PLAY_WALLET_PATH;
const DEMO_TOKEN_MINT =
  process.env.NEXT_PUBLIC_DEMO_TOKEN_MINT ??
  "C6eDfhad3BqR99NxMyvhQf9EGqG9DSe71xVomb4u9H1w";
const recipientValue = process.argv[2];
const amountValue = process.argv[3] ?? "20";

if (!WALLET_PATH) {
  throw new Error(
    "PROOF_PLAY_WALLET_PATH is required and must point to the demo-token mint authority keypair.",
  );
}
if (!recipientValue) {
  throw new Error("Usage: npm run demo:fund -- <wallet-address> [amount]");
}
if (!/^\d+(?:\.\d{1,6})?$/.test(amountValue)) {
  throw new Error("Funding amount must be positive with at most 6 decimals.");
}

async function loadKeypair(path: string) {
  const value = JSON.parse(await readFile(resolve(path), "utf8")) as unknown;
  if (
    !Array.isArray(value) ||
    value.length !== 64 ||
    value.some(
      (byte) =>
        !Number.isInteger(byte) || Number(byte) < 0 || Number(byte) > 255,
    )
  ) {
    throw new Error("The configured mint-authority keypair file is invalid.");
  }
  return Keypair.fromSecretKey(Uint8Array.from(value as number[]));
}

function baseUnits(value: string, decimals: number) {
  const [whole, fraction = ""] = value.split(".");
  const unit = 10n ** BigInt(decimals);
  const amount =
    BigInt(whole!) * unit + BigInt(fraction.padEnd(decimals, "0") || "0");
  if (amount <= 0n)
    throw new Error("Funding amount must be greater than zero.");
  return amount;
}

const connection = new Connection(RPC_URL, "confirmed");
if ((await connection.getGenesisHash()) !== TXLINE_DEVNET_GENESIS_HASH) {
  throw new Error("PROOF_PLAY_RPC_URL must point to Solana devnet.");
}

const authority = await loadKeypair(WALLET_PATH);
const recipient = new PublicKey(recipientValue);
const mintAddress = new PublicKey(DEMO_TOKEN_MINT);
const mint = await getMint(connection, mintAddress, "confirmed");
if (!mint.mintAuthority?.equals(authority.publicKey)) {
  throw new Error(
    `Configured wallet ${authority.publicKey.toBase58()} is not the demo-token mint authority.`,
  );
}

const destination = await getOrCreateAssociatedTokenAccount(
  connection,
  authority,
  mintAddress,
  recipient,
  false,
  "confirmed",
);
const amount = baseUnits(amountValue, mint.decimals);
const signature = await mintTo(
  connection,
  authority,
  mintAddress,
  destination.address,
  authority,
  amount,
  [],
  { commitment: "confirmed" },
);

console.log(
  JSON.stringify(
    {
      network: "devnet",
      recipient: recipient.toBase58(),
      demoTokenMint: mintAddress.toBase58(),
      tokenAccount: destination.address.toBase58(),
      amount: amountValue,
      signature,
      credentialsIncluded: false,
    },
    null,
    2,
  ),
);
