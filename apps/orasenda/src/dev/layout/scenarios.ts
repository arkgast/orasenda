import type {
  AppInfo,
  MilestoneEvent_Serialize,
  Settings,
  TimerView_Serialize,
} from "../../ipc/bindings";

/**
 * Backend replies for the layout harness (verification/layout, `layout.html?scenario=<name>`).
 * Plain data, no test library: the page runs in a real browser with `mockIPC`, never in Tauri.
 */
export type Handler = (cmd: string, args: unknown) => unknown;

const INFO: AppInfo = { name: "Orasenda", version: "0.1.0", os: "macos", arch: "aarch64" };

const IDLE: TimerView_Serialize = {
  state: "idle",
  phase: "focus",
  mode: "idle",
  remainingMs: 0,
  remaining: "",
  remainingLabel: "",
  progress: 0,
  sessionId: null,
  preset: null,
  plannedMin: null,
  finish: null,
  store: "ok",
  notifications: "granted",
};

const RUNNING: TimerView_Serialize = {
  ...IDLE,
  state: "running",
  mode: "focus",
  remainingMs: 1_499_000,
  remaining: "24:59",
  remainingLabel: "24 minutes 59 seconds",
  progress: 0.001,
  sessionId: "s1",
  preset: "classic",
  plannedMin: 25,
  finish: "15:20",
};

const PAUSED: TimerView_Serialize = { ...RUNNING, state: "paused", mode: "paused", finish: null };

const SETTINGS: Settings = {
  theme: "system",
  preset: "classic",
  custom: { focusMin: 45, breakMin: 10 },
  notifySessionEnd: true,
};

const ENDED: MilestoneEvent_Serialize = {
  kind: "ended",
  endReason: "completed",
  sessionId: "s1",
};

type Parts = {
  view?: TimerView_Serialize;
  pending?: MilestoneEvent_Serialize[];
  settings?: Settings;
  replies?: Record<string, () => unknown>;
};

/** The defaults below, with `replies` replacing single commands (a rejected promise is a failure). */
function backend({ view = IDLE, pending = [], settings = SETTINGS, replies = {} }: Parts): Handler {
  const all: Record<string, () => unknown> = {
    app_info: () => INFO,
    spike_status: () => ({ enabled: false, platformSupported: true }),
    timer_state: () => ({ view, pending }),
    settings_get: () => settings,
    settings_set: () => null,
    timer_start: () => RUNNING,
    timer_pause: () => PAUSED,
    timer_resume: () => RUNNING,
    timer_stop: () => IDLE,
    navigate_take: () => null,
    notifications_request: () => view.notifications,
    notifications_open_settings: () => null,
    ...replies,
  };
  return (cmd) => {
    const reply = all[cmd];
    if (!reply) throw new Error(`unexpected command ${cmd}`);
    return reply();
  };
}

const rejects = (kind: string, message: string) => () => Promise.reject({ kind, message });

const SCENARIOS: Record<string, Handler> = {
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
  settingsUnavailable: backend({ replies: { settings_get: rejects("unavailable", "no store") } }),
  customChecked: backend({ settings: { ...SETTINGS, preset: "custom" } }),
  // Settings: a refused custom spec gives the longest save line once both fields are out of range.
  settingsInvalid: backend({ replies: { settings_set: rejects("invalidSpec", "out of range") } }),
  // Settings: macOS has notifications off while the preference is on (the longest status line).
  notificationsDenied: backend({ view: { ...IDLE, notifications: "denied" } }),
};

export const SCENARIO_NAMES: readonly string[] = Object.keys(SCENARIOS);

export function scenarioHandler(name: string): Handler | undefined {
  return SCENARIOS[name];
}
