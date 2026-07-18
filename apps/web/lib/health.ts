type Environment = Partial<Record<string, string | undefined>>;

export type HealthSnapshot = {
  status: "ready" | "degraded";
  checkedAt: string;
  release: string;
  network: "devnet";
  services: {
    web: { status: "ready" };
    txline: {
      status: "configured" | "replay-only" | "reachable" | "unreachable";
      mode: "live-and-replay" | "replay-only";
    };
    keeper: { status: "external"; endpoint: "/healthz" };
  };
};

export async function buildHealthSnapshot(
  input: {
    environment?: Environment;
    probeTxline?: (() => Promise<unknown>) | undefined;
    now?: (() => Date) | undefined;
  } = {},
): Promise<HealthSnapshot> {
  const environment = input.environment ?? process.env;
  const configured = Boolean(
    environment.TXLINE_GUEST_JWT?.trim() &&
    environment.TXLINE_API_TOKEN?.trim(),
  );
  let txlineStatus: HealthSnapshot["services"]["txline"]["status"] = configured
    ? "configured"
    : "replay-only";
  let status: HealthSnapshot["status"] = "ready";

  if (input.probeTxline) {
    try {
      await input.probeTxline();
      txlineStatus = "reachable";
    } catch {
      txlineStatus = "unreachable";
      status = "degraded";
    }
  }

  return {
    status,
    checkedAt: (input.now ?? (() => new Date()))().toISOString(),
    release: environment.CF_PAGES_COMMIT_SHA?.slice(0, 12) || "local",
    network: "devnet",
    services: {
      web: { status: "ready" },
      txline: {
        status: txlineStatus,
        mode: configured ? "live-and-replay" : "replay-only",
      },
      keeper: { status: "external", endpoint: "/healthz" },
    },
  };
}
