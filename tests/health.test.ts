import { buildHealthSnapshot } from "../apps/web/lib/health";
import { describe, expect, it, vi } from "vitest";

describe("public health snapshot", () => {
  const now = () => new Date("2026-07-18T12:00:00.000Z");

  it("reports a safe replay-only mode without credentials", async () => {
    const snapshot = await buildHealthSnapshot({ environment: {}, now });
    expect(snapshot).toMatchObject({
      status: "ready",
      checkedAt: "2026-07-18T12:00:00.000Z",
      network: "devnet",
      services: { txline: { status: "replay-only", mode: "replay-only" } },
    });
    expect(JSON.stringify(snapshot)).not.toMatch(/token|jwt|secret/i);
  });

  it("reports a failed live probe without exposing its error", async () => {
    const probe = vi.fn(async () => {
      throw new Error("secret upstream detail");
    });
    const snapshot = await buildHealthSnapshot({
      environment: { TXLINE_GUEST_JWT: "jwt", TXLINE_API_TOKEN: "token" },
      probeTxline: probe,
      now,
    });
    expect(snapshot).toMatchObject({
      status: "degraded",
      services: { txline: { status: "unreachable" } },
    });
    expect(JSON.stringify(snapshot)).not.toContain("secret upstream detail");
  });
});
