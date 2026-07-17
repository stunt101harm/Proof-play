import { assertFixtureId } from "@proof-play/txline";
import { createServerTxlineAdapter } from "../../../../../lib/txline-server";
import { publicTxlineError } from "../../../../../lib/txline-route";

const encoder = new TextEncoder();

function encodeSse(event: string, data: unknown, id?: string) {
  return encoder.encode(
    `${id ? `id: ${id}\n` : ""}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
  );
}

export async function GET(request: Request) {
  const fixtureId =
    new URL(request.url).searchParams.get("fixtureId") ?? undefined;
  try {
    if (fixtureId) assertFixtureId(fixtureId);
    const adapter = createServerTxlineAdapter();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const record of adapter.streamScores({
            fixtureId,
            signal: request.signal,
          })) {
            controller.enqueue(
              encodeSse(
                "score",
                record,
                `${record.fixtureId}:${record.sequence}`,
              ),
            );
          }
        } catch (error) {
          if (!request.signal.aborted) {
            controller.enqueue(encodeSse("error", publicTxlineError(error)));
          }
        } finally {
          if (!request.signal.aborted) controller.close();
        }
      },
    });
    return new Response(stream, {
      headers: {
        "Cache-Control": "private, no-cache, no-transform",
        "Content-Type": "text/event-stream; charset=utf-8",
      },
    });
  } catch (error) {
    return Response.json(
      { error: publicTxlineError(error) },
      { status: 400, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
