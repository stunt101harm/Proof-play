import type {
  MatchLifecycle,
  MatchScoreRecord,
  ParticipantScore,
} from "@proof-play/domain";

export const DEFAULT_REPLAY_DURATION_MS = 75_000;
export const MAX_REPLAY_DURATION_MS = 110_000;
export const REPLAY_TIMELINE_LIMIT = 40;

export type ReplaySpeed = 0.5 | 1 | 2 | 4;
export type ReplayStatus = "idle" | "running" | "paused" | "complete" | "error";

export type ReplayTimelineItem = {
  sequence: number;
  sourceUpdatedAt: string;
  action: string;
  lifecycle: MatchLifecycle;
  statusId: number | null;
  score: MatchScoreRecord["score"];
};

export type ReplayState = {
  sourceMode: "historicalReplay";
  fixtureId: string;
  status: ReplayStatus;
  totalRecords: number;
  processedRecords: number;
  progress: number;
  currentSequence: number | null;
  lifecycle: MatchLifecycle;
  action: string | null;
  statusId: number | null;
  score: {
    participant1: ParticipantScore;
    participant2: ParticipantScore;
  } | null;
  stats: Record<string, number>;
  timeline: ReplayTimelineItem[];
  error: string | null;
};

export type ScheduledReplayRecord = {
  record: MatchScoreRecord;
  delayMs: number;
};

export type ReplayOptions = {
  targetDurationMs?: number;
  speed?: ReplaySpeed;
  signal?: AbortSignal;
  sleep?: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
};

function assertDuration(targetDurationMs: number) {
  if (
    !Number.isFinite(targetDurationMs) ||
    targetDurationMs <= 0 ||
    targetDurationMs > MAX_REPLAY_DURATION_MS
  ) {
    throw new Error(
      `Replay duration must be greater than zero and at most ${MAX_REPLAY_DURATION_MS}ms.`,
    );
  }
}

export function prepareReplayRecords(
  records: readonly MatchScoreRecord[],
  expectedFixtureId?: string,
): MatchScoreRecord[] {
  if (records.length === 0) return [];
  const fixtureId = expectedFixtureId ?? records[0]!.fixtureId;
  const sorted = [...records].sort(
    (left, right) =>
      left.sequence - right.sequence ||
      left.sourceUpdatedAt.localeCompare(right.sourceUpdatedAt),
  );
  const sequences = new Set<number>();
  for (const record of sorted) {
    if (record.fixtureId !== fixtureId) {
      throw new Error(
        `Replay record fixture ${record.fixtureId} does not match ${fixtureId}.`,
      );
    }
    if (!Number.isSafeInteger(record.sequence) || record.sequence < 0) {
      throw new Error("Replay sequences must be non-negative safe integers.");
    }
    if (sequences.has(record.sequence)) {
      throw new Error(`Replay contains duplicate sequence ${record.sequence}.`);
    }
    sequences.add(record.sequence);
    if (Number.isNaN(Date.parse(record.sourceUpdatedAt))) {
      throw new Error(
        `Replay sequence ${record.sequence} has an invalid source timestamp.`,
      );
    }
  }
  return sorted;
}

export function createReplaySchedule(
  records: readonly MatchScoreRecord[],
  targetDurationMs = DEFAULT_REPLAY_DURATION_MS,
): ScheduledReplayRecord[] {
  assertDuration(targetDurationMs);
  const prepared = prepareReplayRecords(records);
  if (prepared.length === 0) return [];
  if (prepared.length === 1) {
    return [{ record: prepared[0]!, delayMs: 0 }];
  }

  const weights = prepared.map((record, index) => {
    if (index === 0) return 0;
    const previous = prepared[index - 1]!;
    const delta = Math.max(
      0,
      Date.parse(record.sourceUpdatedAt) - Date.parse(previous.sourceUpdatedAt),
    );
    // Log weighting preserves visible pauses without letting pre-match gaps
    // consume the deterministic demo window.
    return Math.max(1, Math.log1p(delta));
  });
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);

  return prepared.map((record, index) => ({
    record,
    delayMs:
      index === 0
        ? 0
        : Math.max(
            0,
            Math.round((weights[index]! / totalWeight) * targetDurationMs),
          ),
  }));
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

export async function* replayScoreRecords(
  records: readonly MatchScoreRecord[],
  options: ReplayOptions = {},
): AsyncGenerator<MatchScoreRecord> {
  const speed = options.speed ?? 1;
  if (![0.5, 1, 2, 4].includes(speed)) {
    throw new Error("Replay speed must be 0.5, 1, 2, or 4.");
  }
  const schedule = createReplaySchedule(
    records,
    options.targetDurationMs ?? DEFAULT_REPLAY_DURATION_MS,
  );
  const sleep = options.sleep ?? defaultSleep;

  for (const item of schedule) {
    if (options.signal?.aborted) return;
    await sleep(item.delayMs / speed, options.signal);
    if (options.signal?.aborted) return;
    yield item.record;
  }
}

export function initialReplayState(
  fixtureId: string,
  totalRecords = 0,
): ReplayState {
  return {
    sourceMode: "historicalReplay",
    fixtureId,
    status: "idle",
    totalRecords,
    processedRecords: 0,
    progress: 0,
    currentSequence: null,
    lifecycle: "scheduled",
    action: null,
    statusId: null,
    score: null,
    stats: {},
    timeline: [],
    error: null,
  };
}

export function setReplayStatus(
  state: ReplayState,
  status: ReplayStatus,
  error: string | null = null,
): ReplayState {
  return { ...state, status, error };
}

export function reduceReplayRecord(
  state: ReplayState,
  record: MatchScoreRecord,
  totalRecords = state.totalRecords,
): ReplayState {
  if (record.fixtureId !== state.fixtureId) {
    throw new Error(
      `Replay event fixture ${record.fixtureId} does not match ${state.fixtureId}.`,
    );
  }
  if (
    state.currentSequence !== null &&
    record.sequence <= state.currentSequence
  ) {
    return state;
  }
  const processedRecords = state.processedRecords + 1;
  const timeline = [
    ...state.timeline,
    {
      sequence: record.sequence,
      sourceUpdatedAt: record.sourceUpdatedAt,
      action: record.action,
      lifecycle: record.lifecycle,
      statusId: record.statusId,
      score: record.score,
    },
  ].slice(-REPLAY_TIMELINE_LIMIT);

  return {
    ...state,
    status: record.isFinal ? "complete" : "running",
    totalRecords,
    processedRecords,
    progress:
      totalRecords > 0
        ? Math.min(1, processedRecords / totalRecords)
        : record.isFinal
          ? 1
          : 0,
    currentSequence: record.sequence,
    lifecycle: record.lifecycle,
    action: record.action,
    statusId: record.statusId,
    score: record.score,
    stats: { ...record.stats },
    timeline,
    error: null,
  };
}
