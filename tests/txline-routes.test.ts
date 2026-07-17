import { describe, expect, it, vi } from "vitest";
import { GET as getFixtures } from "../apps/web/app/api/txline/fixtures/route";
import { TxlineDiagnosticError } from "../packages/txline/src";
import {
  publicTxlineError,
  readIntegerQuery,
  txlineJson,
} from "../apps/web/lib/txline-route";
import { RAW_FIXTURE } from "./fixtures/txline-samples";

describe("safe TxLINE server route contract", () => {
  it("validates integer query parameters before reaching TxLINE", () => {
    expect(
      readIntegerQuery(
        new URLSearchParams("competitionId=72"),
        "competitionId",
        {
          min: 1,
        },
      ),
    ).toBe(72);
    expect(() =>
      readIntegerQuery(
        new URLSearchParams("competitionId=invalid"),
        "competitionId",
      ),
    ).toThrow(expect.objectContaining({ code: "TXLINE_INVALID_INPUT" }));
  });

  it("returns only normalized data and public provenance metadata", async () => {
    const response = txlineJson([{ fixtureId: "42" }]);
    await expect(response.json()).resolves.toMatchObject({
      data: [{ fixtureId: "42" }],
      meta: { source: "txline", network: "devnet" },
    });
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("serves a normalized route response while credentials stay in headers", async () => {
    vi.stubEnv("TXLINE_GUEST_JWT", "route-guest-jwt");
    vi.stubEnv("TXLINE_API_TOKEN", "route-api-token");
    const fetchMock = vi.fn(
      async (_input: URL | RequestInfo, init?: RequestInit) => {
        const headers = new Headers(init?.headers);
        expect(headers.get("Authorization")).toBe("Bearer route-guest-jwt");
        expect(headers.get("X-Api-Token")).toBe("route-api-token");
        return Response.json([RAW_FIXTURE]);
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    try {
      const response = await getFixtures(
        new Request(
          "http://proofplay.test/api/txline/fixtures?competitionId=72&startEpochDay=20605",
        ),
      );
      const body = await response.text();
      expect(response.status).toBe(200);
      expect(body).toContain('"fixtureId":"17588223"');
      expect(body).not.toContain("route-guest-jwt");
      expect(body).not.toContain("route-api-token");
    } finally {
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    }
  });

  it("redacts upstream credentials from public errors", () => {
    const error = publicTxlineError(
      new TxlineDiagnosticError({
        code: "TXLINE_ACCESS_DENIED",
        message: "Rejected Authorization: Bearer abc.def.ghi",
        hint: "Check server credentials.",
      }),
    );
    expect(error.message).toContain("Bearer [redacted]");
    expect(JSON.stringify(error)).not.toContain("abc.def.ghi");
  });
});
