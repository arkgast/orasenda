import type {
  AppInfo,
  DisplayInfo,
  KeyboardView_Serialize,
  MilestoneEvent_Serialize,
  NoteView,
  PresetEntry,
  Settings,
  ShortcutView_Serialize,
  TimerView_Serialize,
} from "../../../shared/ipc/bindings";

/**
 * Backend replies for the layout harness (verification/layout, `layout.html?scenario=<name>`).
 * Plain data, no test library: the page runs in a real browser with `mockIPC`, never in Tauri.
 */
export type Handler = (cmd: string, args: unknown) => unknown;

export const GENTLE = "0192f6a0-0000-7000-8000-000000000001";
export const STEADY = "0192f6a0-0000-7000-8000-000000000002";
export const DEEP = "0192f6a0-0000-7000-8000-000000000003";

/** The three default presets, as a fresh library lists them. */
export const PRESETS: PresetEntry[] = [
  { id: GENTLE, name: "Gentle Start", focusMin: 15, breakMin: 5, longBreakMin: 15, rounds: 4 },
  { id: STEADY, name: "Steady Focus", focusMin: 25, breakMin: 5, longBreakMin: 15, rounds: 4 },
  { id: DEEP, name: "Deep Work", focusMin: 90, breakMin: 15, longBreakMin: 30, rounds: 2 },
].map((preset) => ({ ...preset, isDefault: true, isChanged: false }));

export const INFO: AppInfo = { name: "Orasenda", version: "0.1.0", os: "macos", arch: "aarch64" };

export const IDLE: TimerView_Serialize = {
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
  breakKind: null,
  extensions: 0,
  canExtend: false,
  intent: null,
  suggestion: null,
  offer: null,
  checkIn: null,
  capLine: null,
  hint: null,
  tip: null,
  welcome: false,
};

export const RUNNING: TimerView_Serialize = {
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

export const PAUSED: TimerView_Serialize = {
  ...RUNNING,
  state: "paused",
  mode: "paused",
  finish: null,
};

export const BREAK: TimerView_Serialize = {
  ...RUNNING,
  phase: "break",
  mode: "break",
  remainingMs: 299_000,
  remaining: "4:59",
  remainingLabel: "4 minutes 59 seconds",
  progress: 0.01,
  breakKind: "short",
  finish: "14:30",
  canExtend: true,
  suggestion: { text: "Look at something far away.", label: "optional" },
};

const DISPLAY_NAMES = ["Built-in Retina Display", "DELL U2720Q", "LG UltraFine"];

/** `count` connected displays (1 to 3), the main window's first: `layout.html?displays=<count>`. */
export function displaysFor(count: number): DisplayInfo[] {
  return DISPLAY_NAMES.slice(0, Math.min(Math.max(count, 1), DISPLAY_NAMES.length)).map(
    (name, index) => ({ id: String(index + 1), name, hasMainWindow: index === 0 }),
  );
}

export const SETTINGS: Settings = {
  theme: "system",
  presetId: STEADY,
  extensionCap: 2,
  autoContinue: false,
  longestFocusMin: 90,
  deepCapOn: true,
  deepCapHours: 4,
  notifySessionEnd: true,
  notifyTwoMinutes: false,
  startPauseKeys: "Control+Alt+KeyF",
  captureKeys: "Control+Alt+KeyN",
  singleKey: true,
};

const shortcut = (keys: string, display: string, spoken: string): ShortcutView_Serialize => ({
  keys,
  display,
  spoken,
  status: "registered",
});

export const KEYBOARD: KeyboardView_Serialize = {
  startPause: shortcut("Control+Alt+KeyF", "⌃⌥F", "Control-Option-F"),
  capture: shortcut("Control+Alt+KeyN", "⌃⌥N", "Control-Option-N"),
  singleKey: true,
  voiceOver: false,
};

export const NOTE: NoteView = {
  id: "note-1",
  text: "Call the dentist",
  kind: "internal",
  createdAt: "14:32",
  createdAtLabel: "Today at 14:32",
};

type Parts = {
  view?: TimerView_Serialize;
  pending?: MilestoneEvent_Serialize[];
  settings?: Settings;
  replies?: Record<string, () => unknown>;
};

/** The defaults below, with `replies` replacing single commands (a rejected promise is a failure). */
export function backend({
  view = IDLE,
  pending = [],
  settings = SETTINGS,
  replies = {},
}: Parts): Handler {
  const all: Record<string, () => unknown> = {
    app_info: () => INFO,
    spike_status: () => ({ enabled: false, platformSupported: true }),
    timer_state: () => ({ view, pending }),
    settings_get: () => settings,
    settings_set: () => null,
    keyboard_state: () => KEYBOARD,
    timer_start: () => RUNNING,
    timer_pause: () => PAUSED,
    timer_resume: () => RUNNING,
    timer_stop: () => IDLE,
    timer_extend: () => RUNNING,
    timer_set_intent: () => RUNNING,
    timer_dismiss_offer: () => IDLE,
    timer_take_break: () => BREAK,
    tip_seen: () => IDLE,
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
    // The capture panel and the palette's Capture row.
    capture_open: () => null,
    capture_close: () => null,
    capture_note: () => NOTE,
    ...replies,
  };
  return (cmd) => {
    const reply = all[cmd];
    if (!reply) throw new Error(`unexpected command ${cmd}`);
    return reply();
  };
}
