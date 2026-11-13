import type { TimerView_Serialize } from "../../../shared/ipc/bindings";
import type { Handler } from "./backend";
import { BREAK, backend, DEEP, IDLE, RUNNING } from "./backend";
import { ENDED } from "./timer";

// The floater's longest case: a Deep Work session of 1:30:00.
export const DEEP_RUNNING: TimerView_Serialize = {
  ...RUNNING,
  remainingMs: 5_399_000,
  remaining: "1:29:59",
  remainingLabel: "1 hour 29 minutes 59 seconds",
  presetId: DEEP,
  presetName: "Deep Work",
  breakMin: 15,
  plannedMin: 90,
  finish: "16:50",
};

// Session cadence (E): the states Today adds. Long texts are the longest the spec allows.
const WARNING: TimerView_Serialize = {
  ...RUNNING,
  mode: "warning",
  remainingMs: 119_000,
  remaining: "1:59",
  remainingLabel: "1 minute 59 seconds",
  progress: 0.92,
  canExtend: true,
  extensions: 0,
};
const AUTO_STEP: TimerView_Serialize = { ...RUNNING, checkIn: "Still going · ends 15:40" };
const LONG_BREAK: TimerView_Serialize = {
  ...BREAK,
  breakKind: "long",
  suggestion: { text: "Sit quietly and let your mind wander.", label: "experimental" },
};

const ended = (phase: "focus" | "break", endReason: "completed" | "stopped") => ({
  ...ENDED,
  phase,
  endReason,
});

export const TODAY: Record<string, Handler> = {
  // Session cadence: Today's new rows and states.
  warning: backend({ view: WARNING }),
  warningAuto: backend({ view: { ...WARNING, canExtend: false, checkIn: AUTO_STEP.checkIn } }),
  autoStep: backend({ view: AUTO_STEP }),
  breakShort: backend({ view: BREAK }),
  breakLong: backend({ view: LONG_BREAK }),
  breakPaused: backend({ view: { ...BREAK, state: "paused", mode: "paused" } }),
  breakCap: backend({
    view: BREAK,
    pending: [
      { ...ended("focus", "completed"), kind: "capReached" },
      { ...ended("break", "completed"), kind: "breakStarted" },
    ],
  }),
  keepGoing: backend({ view: { ...IDLE, offer: "keepGoing" } }),
  breakOver: backend({ pending: [ended("break", "completed")] }),
  breakEnded: backend({ pending: [ended("break", "stopped")] }),
  capLine: backend({ view: { ...IDLE, capLine: "4 hours of focus today." } }),
  // Today polish: Deep Work at its longest face. The twin of deepRunning (the plan's name for Today), the same view.
  runningDeep: backend({ view: DEEP_RUNNING }),
  // The one-time keep-going hint after a first "+10 min" (a running focus).
  hintKeepGoing: backend({
    view: { ...RUNNING, hint: "keepGoing" },
    replies: { hint_shown: () => RUNNING },
  }),
  // Welcome and tips (spec: Hotkeys and capture): the first-run line, and each tip joined to "Session ended.".
  welcome: backend({ view: { ...IDLE, welcome: true } }),
  tipShortcut: backend({ view: { ...IDLE, tip: "globalShortcut" }, pending: [ENDED] }),
  tipFocusViewKeys: backend({ view: { ...IDLE, tip: "focusViewKeys" }, pending: [ENDED] }),
  tipFocusView: backend({ view: { ...IDLE, tip: "focusView" }, pending: [ENDED] }),
};
