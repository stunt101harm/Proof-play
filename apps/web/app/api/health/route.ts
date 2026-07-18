import { buildHealthSnapshot } from "../../../lib/health";
import { createServerTxlineAdapter } from "../../../lib/txline-server";

export async function GET(request: Request) {
  const probeRequested =
    new URL(request.url).searchParams.get("probe") === "txline";
  const snapshot = await buildHealthSnapshot({
    probeTxline: probeRequested
      ? () => createServerTxlineAdapter().listFixtures()
      : undefined,
  });
  return Response.json(snapshot, {
    status: snapshot.status === "ready" ? 200 : 503,
    headers: { "Cache-Control": "private, no-store" },
  });
}
