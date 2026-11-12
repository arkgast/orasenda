import type {
  AppInfo,
  DisplayInfo,
  MilestoneEvent_Serialize,
  PresetEntry,
  Settings,
  TimerView_Serialize,
} from "../../ipc/bindings";

/**
 * Backend replies for the layout harness (verification/layout, `layout.html?scenario=<name>`).
 * Plain data, no test library: the page runs in a real browser with `mockIPC`, never in Tauri.
 */
export type Handler = (cmd: string, args: unknown) => unknown;

const GENTLE = "0192f6a0-0000-7000-8000-000000000001";
const STEADY = "0192f6a0-0000-7000-8000-000000000002";
const DEEP = "0192f6a0-0000-7000-8000-000000000003";

/** The three default presets, as a fresh library lists them. */
const PRESETS: PresetEntry[] = [
  { id: GENTLE, name: "Gentle Start", focusMin: 15, breakMin: 5, longBreakMin: 15, rounds: 4 },
  { id: STEADY, name: "Steady Focus", focusMin: 25, breakMin: 5, longBreakMin: 15, rounds: 4 },
  { id: DEEP, name: "Deep Work", focusMin: 90, breakMin: 15, longBreakMin: 30, rounds: 2 },
].map((preset) => ({ ...preset, isDefault: true, isChanged: false }));

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
  presetId: null,
  presetName: null,
  quick: false,
  breakMin: null,
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
  presetId: STEADY,
  presetName: "Steady Focus",
  breakMin: 5,
  plannedMin: 25,
  finish: "15:20",
};

const PAUSED: TimerView_Serialize = { ...RUNNING, state: "paused", mode: "paused", finish: null };

// The floater's longest case: a Deep Work session of 1:30:00.
const DEEP_RUNNING: TimerView_Serialize = {
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

const DISPLAY_NAMES = ["Built-in Retina Display", "DELL U2720Q", "LG UltraFine"];

/** `count` connected displays (1 to 3), the main window's first: `layout.html?displays=<count>`. */
export function displaysFor(count: number): DisplayInfo[] {
  return DISPLAY_NAMES.slice(0, Math.min(Math.max(count, 1), DISPLAY_NAMES.length)).map(
    (name, index) => ({ id: String(index + 1), name, hasMainWindow: index === 0 }),
  );
}

const SETTINGS: Settings = {
  theme: "system",
  presetId: STEADY,
  extensionCap: 2,
  autoContinue: false,
  longestFocusMin: 90,
  deepCapOn: true,
  deepCapHours: 4,
  notifySessionEnd: true,
  notifyTwoMinutes: false,
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
    presets_list: () => PRESETS,
    navigate_take: () => null,
    notifications_request: () => view.notifications,
    notifications_open_settings: () => null,
    // The Focus window and the floater: the view without draining, and their actions.
    timer_view: () => view,
    displays_list: () => displaysFor(1),
    focus_view_open: () => null,
    focus_view_close: () => null,
    main_show: () => null,
    preset_select: () => null,
    native_menu_popup: () => null,
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
  // Pause answers an error, so the status row shows its line while the session still runs.
  pauseError: backend({ view: RUNNING, replies: { timer_pause: rejects("store", "no timer") } }),
  deepWorkChecked: backend({ settings: { ...SETTINGS, presetId: DEEP } }),
  // Settings: a refused save (a preset no longer in the library) gives the preset's failure line.
  settingsInvalid: backend({ replies: { settings_set: rejects("invalidSpec", "out of range") } }),
  // Settings: macOS has notifications off while the preference is on (the longest status line).
  notificationsDenied: backend({ view: { ...IDLE, notifications: "denied" } }),
  // Focus window and floater: the longest running case, and the failures their status lines show.
  deepRunning: backend({ view: DEEP_RUNNING }),
  viewUnreadable: backend({ replies: { timer_view: rejects("store", "no timer") } }),
  presetSelectError: backend({ replies: { preset_select: rejects("store", "disk full") } }),
  closeError: backend({
    view: RUNNING,
    replies: { focus_view_close: rejects("unavailable", "no window") },
  }),
};

export const SCENARIO_NAMES: readonly string[] = Object.keys(SCENARIOS);

export function scenarioHandler(name: string): Handler | undefined {
  return SCENARIOS[name];
}
