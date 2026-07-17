import type { SolanaNetwork } from "@proof-play/domain";

const NETWORKS = {
  devnet: {
    apiOrigin: "https://txline-dev.txodds.com",
    programId: "6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J",
  },
} as const satisfies Record<
  SolanaNetwork,
  { apiOrigin: string; programId: string }
>;

export function getTxlineNetworkConfig(network: SolanaNetwork) {
  return NETWORKS[network];
}
