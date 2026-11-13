import type {
  AppInfo,
  DisplayInfo,
  KeyboardView_Serialize,
  MilestoneEvent_Serialize,
  NoteView,
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

/** Twelve presets: the three defaults and nine of the person's own, one with the longest name. */
const TWELVE: PresetEntry[] = [
  ...PRESETS,
  ...Array.from({ length: 9 }, (_, i) => ({
    id: `user-${i}`,
    name: i === 8 ? "A very long preset name of forty chars!!" : `Study block ${i + 1}`,
    focusMin: 40,
    breakMin: 10,
    longBreakMin: 30,
    rounds: 3,
    isDefault: false,
    isChanged: false,
  })),
];

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
  breakKind: null,
  extensions: 0,
  canExtend: false,
  intent: null,
  suggestion: null,
  offer: null,
  checkIn: null,
  capLine: null,
  hint: null,
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
const BREAK: TimerView_Serialize = {
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
const LONG_BREAK: TimerView_Serialize = {
  ...BREAK,
  breakKind: "long",
  suggestion: { text: "Sit quietly and let your mind wander.", label: "experimental" },
};
const INTENT = "Write the first draft of the chapter 3 outline and send it to Sam for a read";

const ended = (phase: "focus" | "break", endReason: "completed" | "stopped") => ({
  ...ENDED,
  phase,
  endReason,
});

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
  startPauseKeys: "Control+Alt+KeyF",
  captureKeys: "Control+Alt+KeyN",
  singleKey: true,
};

const KEYBOARD: KeyboardView_Serialize = {
  startPause: {
    keys: "Control+Alt+KeyF",
    display: "⌃⌥F",
    spoken: "Control-Option-F",
    status: "registered",
  },
  capture: {
    keys: "Control+Alt+KeyN",
    display: "⌃⌥N",
    spoken: "Control-Option-N",
    status: "registered",
  },
  singleKey: true,
  voiceOver: false,
};

const ENDED: MilestoneEvent_Serialize = {
  kind: "ended",
  endReason: "completed",
  sessionId: "s1",
  phase: "focus",
  quick: false,
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
    keyboard_state: () => KEYBOARD,
    timer_start: () => RUNNING,
    timer_pause: () => PAUSED,
    timer_resume: () => RUNNING,
    timer_stop: () => IDLE,
    timer_extend: () => RUNNING,
    timer_set_intent: () => RUNNING,
    timer_dismiss_offer: () => IDLE,
    timer_take_break: () => BREAK,
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
  intentSet: backend({ view: { ...RUNNING, intent: INTENT } }),
  intentPaused: backend({ view: { ...PAUSED, intent: "Reply to Sam" } }),
  // The one-time keep-going hint after a first "+10 min" (a running focus).
  hintKeepGoing: backend({
    view: { ...RUNNING, hint: "keepGoing" },
    replies: { hint_shown: () => RUNNING },
  }),
  // Settings: a refused save (a preset no longer in the library) gives the preset's failure line.
  settingsInvalid: backend({ replies: { settings_set: rejects("invalidSpec", "out of range") } }),
  // Settings: twelve presets, so Add preset is at its limit.
  presetsTwelve: backend({ replies: { presets_list: () => TWELVE } }),
  // Settings: macOS has notifications off while the preference is on (the longest status line).
  notificationsDenied: backend({ view: { ...IDLE, notifications: "denied" } }),
  // Settings › Keyboard: the longest lines (another app holds the shortcut, VoiceOver is on) and single keys off.
  keyboardLongest: backend({
    replies: {
      keyboard_state: () => ({
        ...KEYBOARD,
        startPause: { ...KEYBOARD.startPause, status: "failed" },
        voiceOver: true,
      }),
    },
  }),
  keyboardSingleOff: backend({ settings: { ...SETTINGS, singleKey: false } }),
  // Focus window and floater: the longest running case, and the failures their status lines show.
  deepRunning: backend({ view: DEEP_RUNNING }),
  viewUnreadable: backend({ replies: { timer_view: rejects("store", "no timer") } }),
  presetSelectError: backend({ replies: { preset_select: rejects("store", "disk full") } }),
  closeError: backend({
    view: RUNNING,
    replies: { focus_view_close: rejects("unavailable", "no window") },
  }),
};

// Board's Inbox list: 0, 1 and 50 notes, a very long note, and a list that will not load.
const BOARD_SHORTCUT = (display: string) => ({
  keys: "Control+Alt+KeyN",
  display,
  spoken: "Control-Option-N",
  status: "registered" as const,
});
const BOARD_KEYBOARD: KeyboardView_Serialize = {
  startPause: BOARD_SHORTCUT("⌃⌥F"),
  capture: BOARD_SHORTCUT("⌃⌥N"),
  singleKey: true,
  voiceOver: false,
};
const boardNote = (i: number, text: string): NoteView => ({
  id: `note-${i}`,
  text,
  kind: i % 2 === 0 ? "internal" : "external",
  createdAt: i < 3 ? "14:32" : "Yesterday 09:05",
  createdAtLabel: i < 3 ? "Today at 14:32" : "Yesterday at 09:05",
});
const boardNotes = (count: number): NoteView[] =>
  Array.from({ length: count }, (_, i) =>
    boardNote(count - i, i === 1 ? "Wordy".repeat(200) : `Note ${count - i}: email the landlord`),
  );
const boardBackend = (notes: () => unknown): Handler =>
  backend({
    replies: {
      inbox_list: notes,
      inbox_remove: () => null,
      inbox_restore: () => null,
      keyboard_state: () => BOARD_KEYBOARD,
    },
  });
SCENARIOS.boardEmpty = boardBackend(() => []);
SCENARIOS.boardOne = boardBackend(() => boardNotes(1));
SCENARIOS.boardFifty = boardBackend(() => boardNotes(50));
SCENARIOS.boardLong = boardBackend(() => [
  boardNote(
    1,
    `${"A thought that goes on and on, ".repeat(30)}\nand has a second line.`.slice(0, 1000),
  ),
  boardNote(2, "Supercalifragilisticexpialidocious".repeat(6)),
]);
SCENARIOS.boardUnreadable = boardBackend(() => Promise.reject("store"));

export const SCENARIO_NAMES: readonly string[] = Object.keys(SCENARIOS);

export function scenarioHandler(name: string): Handler | undefined {
  return SCENARIOS[name];
}
