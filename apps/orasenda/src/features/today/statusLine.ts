import type { StoreStatus, TimerCommandError } from "../../ipc/bindings";

export type StatusInput = {
  /** `timer_start` answered an error that is not a race. */
  startError: boolean;
  /** `timer_pause`, `timer_resume` or `timer_stop` answered an error that is not a race. */
  controlError: boolean;
  /** `timer_state` failed: no view will come this launch. */
  timerUnavailable: boolean;
  /** The one-shot milestone line ("Session ended."), or `null`. */
  notice: string | null;
  store: StoreStatus;
};

export type StatusLine = {
  text: string;
  tone: "neutral" | "attention";
  /** The one action the row offers: repeat the last start. */
  action?: "tryAgain";
};

/** A rank 2 line and the store line share a row only up to this many characters (InlineNotice README). */
const JOIN_LIMIT = 65;

const STORE_LINES: Readonly<Record<Exclude<StoreStatus, "ok">, string>> = {
  unavailable: "Orasenda can't save sessions right now.",
  newer: "This data was saved by a newer Orasenda.",
};

/**
 * Races between surfaces (ADR-013): another surface got there first, so the next view is the truth
 * and nothing is shown. Any other error, `invalidSpec` included, is a failure.
 */
export function commandFailure(error: TimerCommandError): "race" | "failure" {
  switch (error.kind) {
    case "alreadyRunning":
    case "nothingRunning":
    case "wrongState":
      return "race";
    default:
      return "failure";
  }
}

/**
 * The one line Today's status row shows, by priority: the answer to the last action (rank 1), a
 * one-shot milestone (rank 2), then the standing store line (rank 3). A milestone and the store
 * line join in one row when together they fit `JOIN_LIMIT`; a joined row takes the first
 * sentence's tone. Otherwise the higher line shows alone.
 */
export function statusLine(input: StatusInput): StatusLine | null {
  if (input.startError) {
    return {
      text: "Focus didn't start. Orasenda's timer isn't responding.",
      tone: "attention",
      action: "tryAgain",
    };
  }
  if (input.controlError) return { text: "Orasenda's timer isn't responding.", tone: "attention" };
  if (input.timerUnavailable) {
    return { text: "Timer unavailable. Restart Orasenda to try again.", tone: "attention" };
  }
  const store = input.store === "ok" ? null : STORE_LINES[input.store];
  if (input.notice) {
    const joined = store ? `${input.notice} ${store}` : null;
    return {
      text: joined && joined.length <= JOIN_LIMIT ? joined : input.notice,
      tone: "neutral",
    };
  }
  return store ? { text: store, tone: "attention" } : null;
}
