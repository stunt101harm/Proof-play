import { TxlineDiagnosticError } from "@proof-play/txline";
import { createServerTxlineAdapter } from "../../../../../lib/txline-server";
import {
  readIntegerQuery,
  txlineErrorResponse,
  txlineJson,
} from "../../../../../lib/txline-route";

export async function GET(
  request: Request,
  context: { params: Promise<{ fixtureId: string }> },
) {
  try {
    const { fixtureId } = await context.params;
    const searchParams = new URL(request.url).searchParams;
    const mode = searchParams.get("mode") ?? "snapshot";
    const adapter = createServerTxlineAdapter();
    if (mode === "snapshot") {
      return txlineJson(
        await adapter.getScoreSnapshot(fixtureId, {
          asOf: readIntegerQuery(searchParams, "asOf", { min: 1 }),
        }),
      );
    }
    if (mode === "updates") {
      return txlineJson(await adapter.getScoreUpdates(fixtureId));
    }
    if (mode === "historical") {
      return txlineJson(await adapter.getHistoricalScores(fixtureId));
    }
    throw new TxlineDiagnosticError({
      code: "TXLINE_INVALID_INPUT",
      message: "Score mode must be snapshot, updates, or historical.",
      hint: "Use the normalized score route's documented mode values.",
      status: 400,
    });
  } catch (error) {
    return txlineErrorResponse(error);
  }
}
