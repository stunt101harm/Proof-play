import type { SolanaNetwork } from "@proof-play/domain";

export const TXLINE_DEVNET_GENESIS_HASH =
  "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";

export const TXLINE_DEVNET = {
  network: "devnet",
  rpcUrl: "https://api.devnet.solana.com",
  apiOrigin: "https://txline-dev.txodds.com",
  apiBaseUrl: "https://txline-dev.txodds.com/api",
  programId: "6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J",
  tokenMint: "4Zao8ocPhmMgq7PdsYWyxvqySMGx7xb9cMftPMkEokRG",
  freeServiceLevelId: 1,
  durationWeeks: 4,
  selectedLeagues: [] as number[],
} as const;

export type TxlineNetworkConfig = {
  network: SolanaNetwork;
  rpcUrl: string;
  apiOrigin: string;
  apiBaseUrl: string;
  programId: string;
  tokenMint: string;
  freeServiceLevelId: number;
  durationWeeks: number;
  selectedLeagues: number[];
};

export type TxlineNetworkOverrides = Partial<
  Pick<TxlineNetworkConfig, "rpcUrl" | "apiOrigin" | "programId" | "tokenMint">
>;

function normalizeOrigin(value: string) {
  const url = new URL(value);

  if (url.protocol !== "https:") {
    throw new Error(`TxLINE URLs must use HTTPS; received ${url.protocol}`);
  }

  return url.origin;
}

export function getTxlineNetworkConfig(
  network: SolanaNetwork,
  overrides: TxlineNetworkOverrides = {},
): TxlineNetworkConfig {
  if (network !== "devnet") {
    throw new Error(`Unsupported TxLINE network: ${network}`);
  }

  const apiOrigin = normalizeOrigin(
    overrides.apiOrigin ?? TXLINE_DEVNET.apiOrigin,
  );
  const rpcUrl = new URL(overrides.rpcUrl ?? TXLINE_DEVNET.rpcUrl).toString();
  const programId = overrides.programId ?? TXLINE_DEVNET.programId;
  const tokenMint = overrides.tokenMint ?? TXLINE_DEVNET.tokenMint;

  const mismatches = [
    apiOrigin !== TXLINE_DEVNET.apiOrigin
      ? `API origin must be ${TXLINE_DEVNET.apiOrigin}`
      : null,
    programId !== TXLINE_DEVNET.programId
      ? `program ID must be ${TXLINE_DEVNET.programId}`
      : null,
    tokenMint !== TXLINE_DEVNET.tokenMint
      ? `token mint must be ${TXLINE_DEVNET.tokenMint}`
      : null,
  ].filter(Boolean);

  if (mismatches.length > 0) {
    throw new Error(`TxLINE devnet mismatch: ${mismatches.join("; ")}`);
  }

  return {
    network,
    rpcUrl,
    apiOrigin,
    apiBaseUrl: `${apiOrigin}/api`,
    programId,
    tokenMint,
    freeServiceLevelId: TXLINE_DEVNET.freeServiceLevelId,
    durationWeeks: TXLINE_DEVNET.durationWeeks,
    selectedLeagues: [...TXLINE_DEVNET.selectedLeagues],
  };
}
