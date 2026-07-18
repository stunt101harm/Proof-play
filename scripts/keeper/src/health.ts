import { createServer, type Server } from "node:http";

import type { KeeperLogEvent, KeeperRunResult } from "./core";

export type KeeperHealthSnapshot = {
  status: "starting" | "healthy" | "degraded";
  checkedAt: string;
  startedAt: string;
  lastEventAt: string | null;
  lastRun: {
    startedAt: string;
    completedAt: string | null;
    results: Record<KeeperRunResult["status"], number> | null;
  } | null;
};

function emptyResultCounts(): Record<KeeperRunResult["status"], number> {
  return {
    settled: 0,
    alreadySettled: 0,
    awaitingLock: 0,
    awaitingFinalRecord: 0,
    readyDryRun: 0,
    retryableFailure: 0,
    terminalFailure: 0,
  };
}

export class KeeperHealthMonitor {
  readonly #startedAt: string;
  #lastEventAt: string | null = null;
  #lastRun: KeeperHealthSnapshot["lastRun"] = null;
  #degraded = false;

  constructor(now: () => Date = () => new Date()) {
    this.#startedAt = now().toISOString();
  }

  recordEvent(event: KeeperLogEvent) {
    this.#lastEventAt = event.timestamp;
    if (event.level === "error") this.#degraded = true;
  }

  recordRunStart(now: Date = new Date()) {
    this.#lastRun = {
      startedAt: now.toISOString(),
      completedAt: null,
      results: null,
    };
  }

  recordRunComplete(results: KeeperRunResult[], now: Date = new Date()) {
    const counts = emptyResultCounts();
    for (const result of results) counts[result.status] += 1;
    this.#lastRun = {
      startedAt: this.#lastRun?.startedAt ?? now.toISOString(),
      completedAt: now.toISOString(),
      results: counts,
    };
    this.#degraded = counts.retryableFailure > 0 || counts.terminalFailure > 0;
  }

  recordRunFailure(now: Date = new Date()) {
    this.#lastRun = {
      startedAt: this.#lastRun?.startedAt ?? now.toISOString(),
      completedAt: now.toISOString(),
      results: null,
    };
    this.#degraded = true;
  }

  snapshot(now: Date = new Date()): KeeperHealthSnapshot {
    return {
      status: this.#lastRun
        ? this.#degraded
          ? "degraded"
          : this.#lastRun.completedAt
            ? "healthy"
            : "starting"
        : "starting",
      checkedAt: now.toISOString(),
      startedAt: this.#startedAt,
      lastEventAt: this.#lastEventAt,
      lastRun: this.#lastRun,
    };
  }
}

export function keeperHealthResponse(
  monitor: KeeperHealthMonitor,
  path: string,
) {
  if (path !== "/healthz") {
    return { status: 404, body: { error: "Not found" } };
  }
  const body = monitor.snapshot();
  return { status: body.status === "degraded" ? 503 : 200, body };
}

export async function startKeeperHealthServer(input: {
  monitor: KeeperHealthMonitor;
  port: number;
  host?: string;
}) {
  const server: Server = createServer((request, response) => {
    const result = keeperHealthResponse(
      input.monitor,
      new URL(request.url ?? "/", "http://keeper.local").pathname,
    );
    response.writeHead(result.status, {
      "Cache-Control": "private, no-store",
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    });
    response.end(JSON.stringify(result.body));
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(input.port, input.host ?? "127.0.0.1", () => resolve());
  });
  return {
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}
