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
    const fixture = await createServerTxlineAdapter().getFixture(fixtureId, {
      competitionId: readIntegerQuery(searchParams, "competitionId", {
        min: 1,
      }),
      startEpochDay: readIntegerQuery(searchParams, "startEpochDay"),
    });
    return txlineJson(fixture);
  } catch (error) {
    return txlineErrorResponse(error);
  }
}
