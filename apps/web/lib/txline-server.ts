import {
  TxlineAdapter,
  TxlineApiClient,
  getTxlineNetworkConfig,
  startGuestSession,
  type TxlineTelemetryEvent,
  type TxlineTelemetrySink,
} from "@proof-play/txline";
import { readTxlineServerEnv } from "./env";

type Environment = Partial<Record<string, string | undefined>>;

function defaultTelemetry(event: TxlineTelemetryEvent) {
  const serialized = JSON.stringify(event);
  if (event.outcome === "error") console.error("[txline]", serialized);
  else if (event.outcome === "retry") console.warn("[txline]", serialized);
}

export function createServerTxlineAdapter(
  environment: Environment = process.env,
  options: { telemetry?: TxlineTelemetrySink | false } = {},
) {
  const serverEnv = readTxlineServerEnv(environment);
  const config = getTxlineNetworkConfig("devnet", {
    apiOrigin: serverEnv.apiOrigin,
    rpcUrl:
      environment.SOLANA_RPC_URL ??
      environment.NEXT_PUBLIC_SOLANA_RPC_URL ??
      undefined,
    programId: environment.TXLINE_PROGRAM_ID,
    tokenMint: environment.TXLINE_TOKEN_MINT,
  });
  let guestJwt = serverEnv.guestJwt;
  const telemetry =
    options.telemetry === false
      ? undefined
      : (options.telemetry ?? defaultTelemetry);
  const client = new TxlineApiClient(
    config,
    { apiToken: serverEnv.apiToken, guestJwt },
    {
      telemetry,
      renewGuestJwt: async () => {
        guestJwt = await startGuestSession(config);
        return guestJwt;
      },
    },
  );
  return new TxlineAdapter(client, { telemetry });
}
