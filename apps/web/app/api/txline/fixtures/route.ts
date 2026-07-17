import { createServerTxlineAdapter } from "../../../../lib/txline-server";
import {
  readIntegerQuery,
  txlineErrorResponse,
  txlineJson,
} from "../../../../lib/txline-route";

export async function GET(request: Request) {
  try {
    const searchParams = new URL(request.url).searchParams;
    const fixtures = await createServerTxlineAdapter().listFixtures({
      competitionId: readIntegerQuery(searchParams, "competitionId", {
        min: 1,
      }),
      startEpochDay: readIntegerQuery(searchParams, "startEpochDay"),
    });
    return txlineJson(fixtures);
  } catch (error) {
    return txlineErrorResponse(error);
  }
}
