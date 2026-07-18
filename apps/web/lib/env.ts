import type { SolanaNetwork } from "@proof-play/domain";

const DEFAULT_PROGRAM_ID = "AJwjCjk9sb9SWMiuLWDCDgnL6zFEENgnULfkCYaU5Ar";
const DEFAULT_DEMO_TOKEN_MINT = "C6eDfhad3BqR99NxMyvhQf9EGqG9DSe71xVomb4u9H1w";

type Environment = Partial<Record<string, string | undefined>>;

export type PublicEnv = {
  demoTokenMint: string;
  proofPlayProgramId: string;
  solanaNetwork: SolanaNetwork;
  solanaRpcUrl: string;
};

function readUrl(value: string, name: string): string {
  try {
    return new URL(value).toString();
  } catch {
    throw new Error(`${name} must be an absolute URL`);
  }
}

function readRequired(value: string | undefined, name: string): string {
  if (!value?.trim()) {
    throw new Error(`${name} is required`);
  }
  return value.trim();
}

export function readPublicEnv(
  environment: Environment = process.env,
): PublicEnv {
  const network = environment.NEXT_PUBLIC_SOLANA_NETWORK ?? "devnet";
  if (network !== "devnet") {
    throw new Error("NEXT_PUBLIC_SOLANA_NETWORK must be devnet for the MVP");
  }

  return {
    demoTokenMint:
      environment.NEXT_PUBLIC_DEMO_TOKEN_MINT ?? DEFAULT_DEMO_TOKEN_MINT,
    proofPlayProgramId:
      environment.NEXT_PUBLIC_PROOF_PLAY_PROGRAM_ID ?? DEFAULT_PROGRAM_ID,
    solanaNetwork: "devnet",
    solanaRpcUrl: readUrl(
      environment.NEXT_PUBLIC_SOLANA_RPC_URL ?? "https://api.devnet.solana.com",
      "NEXT_PUBLIC_SOLANA_RPC_URL",
    ),
  };
}

export function readTxlineServerEnv(environment: Environment = process.env) {
  return {
    apiOrigin: readUrl(
      environment.TXLINE_API_ORIGIN ?? "https://txline-dev.txodds.com",
      "TXLINE_API_ORIGIN",
    ),
    guestJwt: readRequired(environment.TXLINE_GUEST_JWT, "TXLINE_GUEST_JWT"),
    apiToken: readRequired(environment.TXLINE_API_TOKEN, "TXLINE_API_TOKEN"),
  };
}
