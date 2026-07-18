import {
  DEFAULT_REPLAY_DURATION_MS,
  prepareReplayRecords,
  replayScoreRecords,
  type ReplaySpeed,
} from "@proof-play/replay";
import { assertFixtureId } from "@proof-play/txline";
import { publicTxlineError } from "../../../../lib/txline-route";
import { createServerTxlineAdapter } from "../../../../lib/txline-server";

const encoder = new TextEncoder();
const replaySpeeds = new Set([0.5, 1, 2, 4]);

function encodeSse(event: string, data: unknown, id?: string) {
  return encoder.encode(
    `${id ? `id: ${id}\n` : ""}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
  );
}

export async function GET(
  request: Request,
  context: { params: Promise<{ fixtureId: string }> },
) {
  try {
    const { fixtureId: rawFixtureId } = await context.params;
    const fixtureId = assertFixtureId(rawFixtureId);
    const searchParams = new URL(request.url).searchParams;
    const speed = Number(searchParams.get("speed") ?? "1") as ReplaySpeed;
    const afterSequence = Number(searchParams.get("afterSequence") ?? "0");
    if (!replaySpeeds.has(speed)) {
      throw new Error("Replay speed must be 0.5, 1, 2, or 4.");
    }
    if (!Number.isSafeInteger(afterSequence) || afterSequence < 0) {
      throw new Error("afterSequence must be a non-negative integer.");
    }

    const allRecords = prepareReplayRecords(
      await createServerTxlineAdapter().getHistoricalScores(fixtureId),
      fixtureId,
    );
    const records = allRecords.filter(
      (record) => record.sequence > afterSequence,
    );
    const remainingDurationMs = Math.max(
      1,
      Math.round(
        DEFAULT_REPLAY_DURATION_MS *
          (records.length / Math.max(1, allRecords.length)),
      ),
    );
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        controller.enqueue(
          encodeSse("replay-meta", {
            fixtureId,
            sourceMode: "historicalReplay",
            source: "txline",
            network: "devnet",
            totalRecords: allRecords.length,
            remainingRecords: records.length,
            targetDurationMs: remainingDurationMs,
            speed,
          }),
        );
        try {
          for await (const record of replayScoreRecords(records, {
            targetDurationMs: remainingDurationMs,
            speed,
            signal: request.signal,
          })) {
            controller.enqueue(
              encodeSse(
                "replay-score",
                record,
                `${record.fixtureId}:${record.sequence}`,
              ),
            );
          }
          if (!request.signal.aborted) {
            controller.enqueue(
              encodeSse("replay-end", {
                fixtureId,
                lastSequence: records.at(-1)?.sequence ?? afterSequence,
              }),
            );
          }
        } catch (error) {
          if (!request.signal.aborted) {
            controller.enqueue(
              encodeSse("replay-error", publicTxlineError(error)),
            );
          }
        } finally {
          if (!request.signal.aborted) controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Cache-Control": "private, no-cache, no-store, no-transform",
        "Content-Type": "text/event-stream; charset=utf-8",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    const publicError = publicTxlineError(error);
    return Response.json(
      { error: publicError },
      { status: 400, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
