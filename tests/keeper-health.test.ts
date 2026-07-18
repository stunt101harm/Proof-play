import {
  KeeperHealthMonitor,
  keeperHealthResponse,
} from "../scripts/keeper/src/health";
import { describe, expect, it } from "vitest";

describe("keeper health monitor", () => {
  const start = new Date("2026-07-18T12:00:00.000Z");

  it("moves from starting to healthy after a successful run", () => {
    const monitor = new KeeperHealthMonitor(() => start);
    expect(monitor.snapshot(start).status).toBe("starting");
    monitor.recordRunStart(new Date("2026-07-18T12:00:01.000Z"));
    monitor.recordRunComplete(
      [
        {
          poolAddress: "pool",
          fixtureId: "18241006",
          status: "alreadySettled",
        },
      ],
      new Date("2026-07-18T12:00:02.000Z"),
    );
    const response = keeperHealthResponse(monitor, "/healthz");
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      status: "healthy",
      lastRun: { results: { alreadySettled: 1, terminalFailure: 0 } },
    });
  });

  it("returns 503 after a terminal run result and 404 elsewhere", () => {
    const monitor = new KeeperHealthMonitor(() => start);
    monitor.recordRunComplete([
      {
        poolAddress: "pool",
        fixtureId: "18241006",
        status: "terminalFailure",
        code: "KEEPER_PROOF_MISMATCH",
      },
    ]);
    expect(keeperHealthResponse(monitor, "/healthz").status).toBe(503);
    expect(keeperHealthResponse(monitor, "/private")).toEqual({
      status: 404,
      body: { error: "Not found" },
    });
  });
});
