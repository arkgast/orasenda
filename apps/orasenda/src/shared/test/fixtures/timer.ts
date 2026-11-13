import { act } from "@testing-library/react";
import type {
  ClockTick_Serialize,
  MilestoneEvent_Serialize,
  PresetEntry,
  Settings,
  TimerView_Serialize,
} from "../../ipc/bindings";
import { events } from "../../ipc/bindings";

export const GENTLE = "0192f6a0-0000-7000-8000-000000000001";
export const STEADY = "0192f6a0-0000-7000-8000-000000000002";
export const DEEP = "0192f6a0-0000-7000-8000-000000000003";

function entry(
  id: string,
  name: string,
  focusMin: number,
  breakMin: number,
  longBreakMin: number,
  rounds: number,
): PresetEntry {
  return { id, name, focusMin, breakMin, longBreakMin, rounds, isDefault: true, isChanged: false };
}

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
  finish: null,
  plannedMin: null,
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
  finish: "15:20",
  plannedMin: 25,
};

export const PAUSED: TimerView_Serialize = {
  ...RUNNING,
  state: "paused",
  mode: "paused",
  finish: null,
};

/** A short break running, with its suggestion. */
export const BREAK: TimerView_Serialize = {
  ...RUNNING,
  phase: "break",
  mode: "break",
  remainingMs: 299_000,
  remaining: "4:59",
  remainingLabel: "4 minutes 59 seconds",
  breakKind: "short",
  finish: "14:30",
  suggestion: { text: "Look at something far away.", label: "optional" },
};

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

/** The three default presets, as `presets_list` answers on a fresh library. */
export const PRESETS: PresetEntry[] = [
  entry(GENTLE, "Gentle Start", 15, 5, 15, 4),
  entry(STEADY, "Steady Focus", 25, 5, 15, 4),
  entry(DEEP, "Deep Work", 90, 15, 30, 2),
];

export async function emitClock(tick: Partial<ClockTick_Serialize> = {}): Promise<void> {
  await act(async () => {
    await events.clockTick.emit({ epochMs: 0, clock: "", idleFinish: null, ...tick });
  });
}

export async function emitTimer(view: TimerView_Serialize): Promise<void> {
  await act(async () => {
    await events.timerTick.emit(view);
  });
}

export async function emitMilestone(event: Partial<MilestoneEvent_Serialize>): Promise<void> {
  await act(async () => {
    await events.timerMilestone.emit({
      kind: "started",
      endReason: null,
      sessionId: null,
      phase: "focus",
      quick: false,
      ...event,
    });
  });
}

export async function emitSettingsChanged(settings: Settings): Promise<void> {
  await act(async () => {
    await events.settingsChanged.emit(settings);
  });
}

export async function emitPresetsChanged(presets: PresetEntry[]): Promise<void> {
  await act(async () => {
    await events.presetsChanged.emit(presets);
  });
}
