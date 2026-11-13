import type { MilestoneEvent_Serialize } from "../../../shared/ipc/bindings";
import type { Handler } from "./backend";
import { backend, IDLE, PAUSED, RUNNING } from "./backend";

export const ENDED: MilestoneEvent_Serialize = {
  kind: "ended",
  endReason: "completed",
  sessionId: "s1",
  phase: "focus",
  quick: false,
};

export const rejects = (kind: string, message: string) => () => Promise.reject({ kind, message });

export const TIMER: Record<string, Handler> = {
  idle: backend({}),
  ended: backend({ pending: [ENDED] }),
  recovered: backend({ pending: [{ ...ENDED, kind: "recovered", endReason: null }] }),
  running: backend({ view: RUNNING }),
  paused: backend({ view: PAUSED }),
  storeEnded: backend({ view: { ...IDLE, store: "unavailable" }, pending: [ENDED] }),
  startError: backend({ replies: { timer_start: rejects("store", "disk full") } }),
  timerUnavailable: backend({ replies: { timer_state: rejects("store", "no timer") } }),
  // The start command never answers, so Start stays in its loading state.
  starting: backend({ replies: { timer_start: () => new Promise(() => {}) } }),
  // Pause answers an error, so the status row shows its line while the session still runs.
  pauseError: backend({ view: RUNNING, replies: { timer_pause: rejects("store", "no timer") } }),
};
