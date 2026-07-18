export const PRODUCT = {
  name: "ProofPlay",
  tagline: "Prediction pools that settle with proof.",
  network: "Solana devnet",
} as const;

export const SYSTEM_COMPONENTS = [
  {
    name: "TxLINE data",
    description: "Fixtures, odds, score events, and validation proofs.",
    status: "Typed adapter ready",
  },
  {
    name: "Condition engine",
    description:
      "Human-readable markets compiled into deterministic predicates.",
    status: "Contract frozen",
  },
  {
    name: "Solana escrow",
    description: "Binary pari-mutuel pools with proof-backed settlement.",
    status: "Devnet verified",
  },
  {
    name: "Proof Receipt",
    description: "Readable evidence for the result, transaction, and payout.",
    status: "Receipt verified",
  },
] as const;

export type DataSourceMode = "live" | "historicalReplay" | "simulated";
export type SolanaNetwork = "devnet";

export * from "./conditions";
export * from "./pools";
export * from "./sports";
