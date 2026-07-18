import type {
  MatchScoreRecord,
  PoolLifecycleState,
  SettlementSourceState,
} from "@proof-play/domain";
import type { TxlineScoreProofV3 } from "@proof-play/txline";

export type KeeperPool = {
  poolAddress: string;
  fixtureId: string;
  state: PoolLifecycleState;
  statKeys: number[];
  strategy: unknown;
};

export type KeeperLogEvent = {
  timestamp: string;
  level: "info" | "warn" | "error";
  event: string;
  poolAddress?: string;
  fixtureId?: string;
  state?: SettlementSourceState;
  attempt?: number;
  code?: string;
  transactionSignature?: string;
};

export type KeeperLogger = (event: KeeperLogEvent) => void;

export type KeeperDependencies = {
  listPools(): Promise<KeeperPool[]>;
  loadPool(poolAddress: string): Promise<KeeperPool>;
  getHistoricalScores(fixtureId: string): Promise<MatchScoreRecord[]>;
  getScoreProof(input: {
    fixtureId: string;
    sequence: number;
    statKeys: number[];
  }): Promise<TxlineScoreProofV3>;
  submitSettlement(input: {
    pool: KeeperPool;
    finalRecord: MatchScoreRecord;
    proof: TxlineScoreProofV3;
  }): Promise<{ transactionSignature: string }>;
  sleep?(milliseconds: number, signal?: AbortSignal): Promise<void>;
};

export type KeeperRunOptions = {
  poolAddress?: string;
  dryRun?: boolean;
  maxAttempts?: number;
  retryBaseDelayMs?: number;
};

export type KeeperRunResult = {
  poolAddress: string;
  fixtureId: string;
  status:
    | "settled"
    | "alreadySettled"
    | "awaitingLock"
    | "awaitingFinalRecord"
    | "readyDryRun"
    | "retryableFailure"
    | "terminalFailure";
  sequence?: number;
  transactionSignature?: string;
  attempts?: number;
  code?: string;
};

class KeeperPhaseError extends Error {
  readonly retryable: boolean;
  readonly code: string;
  readonly attempts: number;

  constructor(input: {
    message: string;
    retryable: boolean;
    code: string;
    attempts: number;
    cause: unknown;
  }) {
    super(input.message, { cause: input.cause });
    this.name = "KeeperPhaseError";
    this.retryable = input.retryable;
    this.code = input.code;
    this.attempts = input.attempts;
  }
}

function errorCode(error: unknown) {
  if (typeof error === "object" && error !== null) {
    const candidate = error as {
      code?: unknown;
      error?: { errorCode?: { code?: unknown } };
    };
    if (typeof candidate.code === "string") return candidate.code;
    const anchorCode = candidate.error?.errorCode?.code;
    if (typeof anchorCode === "string") return anchorCode;
  }
  return "KEEPER_OPERATION_FAILED";
}

export function isRetryableKeeperError(error: unknown) {
  if (typeof error === "object" && error !== null) {
    const retryable = (error as { retryable?: unknown }).retryable;
    if (retryable === true) return true;
    if (retryable === false) return false;
    const status = (error as { status?: unknown }).status;
    if (typeof status === "number" && (status === 429 || status >= 500)) {
      return true;
    }
  }
  const message = error instanceof Error ? error.message : String(error);
  return /429|5\d\d|blockhash|fetch failed|network|socket|timed? ?out|ECONN|rate limit/i.test(
    message,
  );
}

export function isAlreadySettledError(error: unknown) {
  const code = errorCode(error);
  if (
    [
      "PoolNotLocked",
      "PoolAlreadyResolved",
      "AccountAlreadyInitialized",
    ].includes(code)
  ) {
    return true;
  }
  const message = error instanceof Error ? error.message : String(error);
  return /already in use|already initialized|PoolNotLocked|custom program error: 0x0/i.test(
    message,
  );
}

function defaultSleep(milliseconds: number, signal?: AbortSignal) {
  if (signal?.aborted || milliseconds <= 0) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, milliseconds);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

export class SettlementKeeper {
  readonly #dependencies: KeeperDependencies;
  readonly #logger: KeeperLogger;

  constructor(dependencies: KeeperDependencies, logger: KeeperLogger) {
    this.#dependencies = dependencies;
    this.#logger = logger;
  }

  #log(event: Omit<KeeperLogEvent, "timestamp">) {
    this.#logger({ timestamp: new Date().toISOString(), ...event });
  }

  async #withRetry<T>(
    operation: () => Promise<T>,
    input: {
      event: string;
      pool: KeeperPool;
      state: SettlementSourceState;
      maxAttempts: number;
      retryBaseDelayMs: number;
    },
  ): Promise<T> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= input.maxAttempts; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        const retryable = isRetryableKeeperError(error);
        const code = errorCode(error);
        this.#log({
          level: retryable ? "warn" : "error",
          event: input.event,
          poolAddress: input.pool.poolAddress,
          fixtureId: input.pool.fixtureId,
          state: retryable ? "retryableFailure" : "terminalFailure",
          attempt,
          code,
        });
        if (!retryable || attempt === input.maxAttempts) {
          throw new KeeperPhaseError({
            message: `${input.event} failed`,
            retryable,
            code,
            attempts: attempt,
            cause: error,
          });
        }
        const sleep = this.#dependencies.sleep ?? defaultSleep;
        await sleep(input.retryBaseDelayMs * 2 ** (attempt - 1));
      }
    }
    throw lastError;
  }

  async run(options: KeeperRunOptions = {}): Promise<KeeperRunResult[]> {
    const pools = options.poolAddress
      ? [await this.#dependencies.loadPool(options.poolAddress)]
      : await this.#dependencies.listPools();
    const results: KeeperRunResult[] = [];
    for (const pool of pools) {
      results.push(await this.#runPool(pool, options));
    }
    return results;
  }

  async #runPool(
    pool: KeeperPool,
    options: KeeperRunOptions,
  ): Promise<KeeperRunResult> {
    const maxAttempts = options.maxAttempts ?? 4;
    const retryBaseDelayMs = options.retryBaseDelayMs ?? 500;
    if (pool.state !== "locked") {
      const alreadySettled = [
        "settledYes",
        "settledNo",
        "cancelled",
        "closed",
      ].includes(pool.state);
      this.#log({
        level: "info",
        event: alreadySettled
          ? "keeper.pool-already-settled"
          : "keeper.pool-awaiting-lock",
        poolAddress: pool.poolAddress,
        fixtureId: pool.fixtureId,
        state: alreadySettled ? "confirmed" : "awaitingFinalRecord",
      });
      return {
        poolAddress: pool.poolAddress,
        fixtureId: pool.fixtureId,
        status: alreadySettled ? "alreadySettled" : "awaitingLock",
      };
    }

    try {
      const records = await this.#withRetry(
        () => this.#dependencies.getHistoricalScores(pool.fixtureId),
        {
          event: "keeper.history-fetch-failed",
          pool,
          state: "awaitingFinalRecord",
          maxAttempts,
          retryBaseDelayMs,
        },
      );
      const finalRecord = records
        .filter(
          (record) =>
            record.fixtureId === pool.fixtureId &&
            record.isFinal &&
            record.action === "game_finalised" &&
            record.statusId === 100 &&
            record.sequence > 0,
        )
        .sort((left, right) => left.sequence - right.sequence)
        .at(-1);
      if (!finalRecord) {
        this.#log({
          level: "info",
          event: "keeper.final-record-pending",
          poolAddress: pool.poolAddress,
          fixtureId: pool.fixtureId,
          state: "awaitingFinalRecord",
        });
        return {
          poolAddress: pool.poolAddress,
          fixtureId: pool.fixtureId,
          status: "awaitingFinalRecord",
        };
      }

      const proof = await this.#withRetry(
        () =>
          this.#dependencies.getScoreProof({
            fixtureId: pool.fixtureId,
            sequence: finalRecord.sequence,
            statKeys: pool.statKeys,
          }),
        {
          event: "keeper.proof-fetch-failed",
          pool,
          state: "fetchingProof",
          maxAttempts,
          retryBaseDelayMs,
        },
      );
      if (
        proof.fixtureId !== pool.fixtureId ||
        proof.sequence !== finalRecord.sequence ||
        proof.payload.leaves.length !== pool.statKeys.length ||
        proof.payload.leaves.some(
          (leaf, index) =>
            leaf.stat.key !== pool.statKeys[index] || leaf.stat.period !== 100,
        )
      ) {
        throw new KeeperPhaseError({
          message: "Proof does not match the locked pool and finalized record.",
          retryable: false,
          code: "KEEPER_PROOF_MISMATCH",
          attempts: 1,
          cause: null,
        });
      }

      const refreshed = await this.#dependencies.loadPool(pool.poolAddress);
      if (refreshed.state !== "locked") {
        return {
          poolAddress: pool.poolAddress,
          fixtureId: pool.fixtureId,
          status: "alreadySettled",
          sequence: finalRecord.sequence,
        };
      }
      if (options.dryRun) {
        this.#log({
          level: "info",
          event: "keeper.settlement-ready-dry-run",
          poolAddress: pool.poolAddress,
          fixtureId: pool.fixtureId,
          state: "readyToSubmit",
        });
        return {
          poolAddress: pool.poolAddress,
          fixtureId: pool.fixtureId,
          status: "readyDryRun",
          sequence: finalRecord.sequence,
        };
      }

      let submission: { transactionSignature: string };
      try {
        submission = await this.#withRetry(
          () =>
            this.#dependencies.submitSettlement({
              pool: refreshed,
              finalRecord,
              proof,
            }),
          {
            event: "keeper.settlement-submit-failed",
            pool,
            state: "submitting",
            maxAttempts,
            retryBaseDelayMs,
          },
        );
      } catch (error) {
        const cause = error instanceof KeeperPhaseError ? error.cause : error;
        if (isAlreadySettledError(cause)) {
          return {
            poolAddress: pool.poolAddress,
            fixtureId: pool.fixtureId,
            status: "alreadySettled",
            sequence: finalRecord.sequence,
          };
        }
        throw error;
      }
      this.#log({
        level: "info",
        event: "keeper.settlement-confirmed",
        poolAddress: pool.poolAddress,
        fixtureId: pool.fixtureId,
        state: "confirmed",
        transactionSignature: submission.transactionSignature,
      });
      return {
        poolAddress: pool.poolAddress,
        fixtureId: pool.fixtureId,
        status: "settled",
        sequence: finalRecord.sequence,
        transactionSignature: submission.transactionSignature,
      };
    } catch (error) {
      const phaseError =
        error instanceof KeeperPhaseError
          ? error
          : new KeeperPhaseError({
              message: "Keeper pool processing failed.",
              retryable: false,
              code: errorCode(error),
              attempts: 1,
              cause: error,
            });
      return {
        poolAddress: pool.poolAddress,
        fixtureId: pool.fixtureId,
        status: phaseError.retryable ? "retryableFailure" : "terminalFailure",
        attempts: phaseError.attempts,
        code: phaseError.code,
      };
    }
  }

  async watch(input: {
    intervalMs: number;
    signal: AbortSignal;
    runOptions?: KeeperRunOptions;
  }) {
    if (!Number.isSafeInteger(input.intervalMs) || input.intervalMs < 1_000) {
      throw new Error("Keeper watch interval must be at least 1000ms.");
    }
    const sleep = this.#dependencies.sleep ?? defaultSleep;
    while (!input.signal.aborted) {
      await this.run(input.runOptions);
      await sleep(input.intervalMs, input.signal);
    }
  }
}
