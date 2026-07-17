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
    const asOf = readIntegerQuery(new URL(request.url).searchParams, "asOf", {
      min: 1,
    });
    const odds = await createServerTxlineAdapter().getOddsSnapshot(fixtureId, {
      asOf,
    });
    return txlineJson(odds);
  } catch (error) {
    return txlineErrorResponse(error);
  }
}
