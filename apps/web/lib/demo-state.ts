export type DemoStage = "select" | "build" | "join" | "replay" | "settlement";

export type DemoState = {
  stage: DemoStage;
  fixtureId: string | null;
  conditionCommitment: string | null;
  side: "yes" | "no" | null;
  joinedAmount: number;
  replayComplete: boolean;
  resetVersion: number;
};

export type DemoAction =
  | { type: "selectFixture"; fixtureId: string }
  | { type: "compileCondition"; conditionCommitment: string }
  | { type: "joinPool"; side: "yes" | "no"; amount: number }
  | { type: "completeReplay" }
  | { type: "openSettlement" }
  | { type: "back" }
  | { type: "reset" };

export function initialDemoState(resetVersion = 0): DemoState {
  return {
    stage: "select",
    fixtureId: null,
    conditionCommitment: null,
    side: null,
    joinedAmount: 0,
    replayComplete: false,
    resetVersion,
  };
}

const previousStage: Partial<Record<DemoStage, DemoStage>> = {
  build: "select",
  join: "build",
  replay: "join",
  settlement: "replay",
};

export function reduceDemoState(
  state: DemoState,
  action: DemoAction,
): DemoState {
  switch (action.type) {
    case "selectFixture":
      if (state.stage !== "select" || !/^[1-9]\d*$/.test(action.fixtureId)) {
        return state;
      }
      return { ...state, stage: "build", fixtureId: action.fixtureId };
    case "compileCondition":
      if (
        state.stage !== "build" ||
        !/^[0-9a-f]{64}$/i.test(action.conditionCommitment)
      ) {
        return state;
      }
      return {
        ...state,
        stage: "join",
        conditionCommitment: action.conditionCommitment,
      };
    case "joinPool":
      if (
        state.stage !== "join" ||
        !Number.isSafeInteger(action.amount) ||
        action.amount <= 0
      ) {
        return state;
      }
      return {
        ...state,
        stage: "replay",
        side: action.side,
        joinedAmount: action.amount,
      };
    case "completeReplay":
      return state.stage === "replay"
        ? { ...state, replayComplete: true }
        : state;
    case "openSettlement":
      return state.stage === "replay" && state.replayComplete
        ? { ...state, stage: "settlement" }
        : state;
    case "back": {
      const stage = previousStage[state.stage];
      return stage ? { ...state, stage } : state;
    }
    case "reset":
      return initialDemoState(state.resetVersion + 1);
  }
}
