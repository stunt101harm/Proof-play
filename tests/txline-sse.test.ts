import { describe, expect, it, vi } from "vitest";
import {
  ScoreSequenceTracker,
  TxlineAdapter,
  TxlineApiClient,
  getTxlineNetworkConfig,
  normalizeScore,
  parseSseBlock,
  readSseMessages,
} from "../packages/txline/src";
import { rawScore } from "./fixtures/txline-samples";

function sseResponse(records: Array<{ id: string; data: unknown }>) {
  return new Response(
    records
      .map(
        (record) =>
          `id: ${record.id}\nevent: score\ndata: ${JSON.stringify(record.data)}\n\n`,
      )
      .join(""),
    { headers: { "Content-Type": "text/event-stream" } },
  );
}

describe("TxLINE score SSE", () => {
  it("parses comments, multiline data, IDs, and retry hints", () => {
    expect(
      parseSseBlock(
        ': heartbeat\nid: 7\nevent: score\nretry: 1500\ndata: {"fixtureId":\ndata: 42}',
      ),
    ).toEqual({
      id: "7",
      event: "score",
      retry: 1500,
      data: '{"fixtureId":\n42}',
    });
  });

  it("parses event frames split across response chunks", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('id: 1\ndata: {"Seq":'));
        controller.enqueue(new TextEncoder().encode("1}\n\n: heartbeat\n\n"));
        controller.close();
      },
    });
    const messages = [];
    for await (const message of readSseMessages(new Response(body))) {
      messages.push(message);
    }
    expect(messages).toEqual([{ id: "1", data: '{"Seq":1}' }]);
  });

  it("deduplicates and restores sequence order after reconnect", () => {
    const tracker = new ScoreSequenceTracker({ "42": 10 });
    expect(tracker.push(normalizeScore(rawScore(12))).records).toEqual([]);
    expect(
      tracker
        .push(normalizeScore(rawScore(11)))
        .records.map((row) => row.sequence),
    ).toEqual([11, 12]);
    expect(tracker.push(normalizeScore(rawScore(12)))).toMatchObject({
      records: [],
      duplicate: true,
    });
  });

  it("reconnects with Last-Event-ID and does not re-emit duplicate records", async () => {
    const requestHeaders: Headers[] = [];
    const responses = [
      sseResponse([
        { id: "event-11", data: rawScore(11) },
        { id: "event-12", data: rawScore(12) },
      ]),
      sseResponse([
        { id: "event-12", data: rawScore(12) },
        { id: "event-13", data: rawScore(13) },
      ]),
    ];
    const fetchMock = vi.fn(
      async (_input: URL | RequestInfo, init?: RequestInit) => {
        requestHeaders.push(new Headers(init?.headers));
        return responses.shift() ?? sseResponse([]);
      },
    ) as unknown as typeof fetch;
    const client = new TxlineApiClient(
      getTxlineNetworkConfig("devnet"),
      { apiToken: "api-token", guestJwt: "guest-jwt" },
      { fetch: fetchMock },
    );
    const adapter = new TxlineAdapter(client);
    const stream = adapter.streamScores({
      fixtureId: "42",
      startingSequences: { "42": 10 },
      reconnectBaseDelayMs: 0,
      reconnectMaxDelayMs: 0,
      maxReconnectAttempts: 2,
    });

    const sequences = [
      (await stream.next()).value?.sequence,
      (await stream.next()).value?.sequence,
      (await stream.next()).value?.sequence,
    ];
    await stream.return(undefined);

    expect(sequences).toEqual([11, 12, 13]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(requestHeaders[1]?.get("Last-Event-ID")).toBe("event-12");
  });

  it("does not reconnect indefinitely after terminal access rejection", async () => {
    const fetchMock = vi.fn(
      async () => new Response("access denied", { status: 403 }),
    ) as unknown as typeof fetch;
    const adapter = new TxlineAdapter(
      new TxlineApiClient(
        getTxlineNetworkConfig("devnet"),
        { apiToken: "invalid", guestJwt: "guest-jwt" },
        { fetch: fetchMock },
      ),
    );
    const stream = adapter.streamScores({ reconnectBaseDelayMs: 0 });

    await expect(stream.next()).rejects.toMatchObject({
      code: "TXLINE_ACCESS_DENIED",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
