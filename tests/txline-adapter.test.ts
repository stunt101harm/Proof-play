import { describe, expect, it, vi } from "vitest";
import {
  TxlineAdapter,
  TxlineApiClient,
  getTxlineNetworkConfig,
  type TxlineTelemetryEvent,
} from "../packages/txline/src";
import {
  RAW_FIXTURE,
  RAW_ODDS,
  RAW_SCORE_PROOF,
  RAW_SCORE_PROOF_V3,
  rawScore,
} from "./fixtures/txline-samples";

function adapterWithResponses(
  handler: (url: URL) => Response | Promise<Response>,
  telemetry?: (event: TxlineTelemetryEvent) => void,
) {
  const fetchMock = vi.fn((input: URL | RequestInfo) =>
    handler(new URL(input.toString())),
  ) as unknown as typeof fetch;
  const config = getTxlineNetworkConfig("devnet");
  const client = new TxlineApiClient(
    config,
    { apiToken: "server-api-token", guestJwt: "server-guest-jwt" },
    { fetch: fetchMock, telemetry },
  );
  return { adapter: new TxlineAdapter(client, { telemetry }), fetchMock };
}

describe("typed TxLINE adapter", () => {
  it("provides typed fixture detail through the supported snapshot endpoint", async () => {
    const { adapter, fetchMock } = adapterWithResponses(() =>
      Response.json([RAW_FIXTURE]),
    );
    await expect(
      adapter.getFixture("17588223", {
        competitionId: 72,
        startEpochDay: 20605,
      }),
    ).resolves.toMatchObject({ fixtureId: "17588223" });
    expect(new URL(fetchMock.mock.calls[0]![0].toString()).pathname).toBe(
      "/api/fixtures/snapshot",
    );
  });

  it("normalizes odds, score snapshots, updates, and SSE-framed history", async () => {
    const { adapter } = adapterWithResponses((url) => {
      if (url.pathname.includes("/odds/")) return Response.json([RAW_ODDS]);
      if (url.pathname.includes("/historical/")) {
        return new Response(
          `data: ${JSON.stringify(rawScore(2))}\n\ndata: ${JSON.stringify(rawScore(1))}\n\n`,
          { headers: { "Content-Type": "text/event-stream" } },
        );
      }
      return Response.json([rawScore(2), rawScore(1)]);
    });

    await expect(adapter.getOddsSnapshot("17588223")).resolves.toHaveLength(1);
    await expect(adapter.getScoreSnapshot("42")).resolves.toMatchObject([
      { sequence: 1 },
      { sequence: 2 },
    ]);
    await expect(adapter.getScoreUpdates("42")).resolves.toHaveLength(2);
    await expect(adapter.getHistoricalScores("42")).resolves.toMatchObject([
      { sequence: 1 },
      { sequence: 2 },
    ]);
  });

  it("retrieves a typed proof only for a real positive sequence", async () => {
    const { adapter, fetchMock } = adapterWithResponses(() =>
      Response.json(RAW_SCORE_PROOF),
    );
    await expect(
      adapter.getScoreProof({ fixtureId: "42", sequence: 963, statKeys: [1] }),
    ).resolves.toMatchObject({ fixtureId: "42", sequence: 963 });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await expect(
      adapter.getScoreProof({ fixtureId: "42", sequence: 0, statKeys: [1] }),
    ).rejects.toMatchObject({ code: "TXLINE_INVALID_SEQUENCE" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("normalizes the compact V3 multiproof into the exact on-chain payload", async () => {
    const { adapter, fetchMock } = adapterWithResponses(() =>
      Response.json(RAW_SCORE_PROOF_V3),
    );
    await expect(
      adapter.getScoreProofV3({
        fixtureId: "42",
        sequence: 963,
        statKeys: [1, 2],
      }),
    ).resolves.toMatchObject({
      fixtureId: "42",
      sequence: 963,
      payload: {
        fixtureSummary: { fixtureId: "42" },
        leaves: [
          { stat: { key: 1, period: 100 } },
          { stat: { key: 2, period: 100 } },
        ],
        leafIndices: [32, 33],
      },
    });
    expect(new URL(fetchMock.mock.calls[0]![0].toString()).pathname).toBe(
      "/api/scores/stat-validation-v3",
    );

    await expect(
      adapter.getScoreProofV3({
        fixtureId: "42",
        sequence: 963,
        statKeys: [2, 1],
      }),
    ).rejects.toMatchObject({ code: "TXLINE_NORMALIZATION_ERROR" });
  });

  it("emits credential-free structured telemetry", async () => {
    const events: TxlineTelemetryEvent[] = [];
    const { adapter } = adapterWithResponses(
      () => Response.json([RAW_FIXTURE]),
      (event) => events.push(event),
    );
    await adapter.listFixtures();
    const serialized = JSON.stringify(events);
    expect(
      events.some((event) => event.operation === "fixtures.snapshot"),
    ).toBe(true);
    expect(serialized).not.toContain("server-api-token");
    expect(serialized).not.toContain("server-guest-jwt");
  });
});
