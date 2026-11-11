import { mockIPC } from "@tauri-apps/api/mocks";
import { act } from "@testing-library/react";
import type {
  AppInfo,
  ClockTick_Serialize,
  MilestoneEvent_Serialize,
  NavigatePage,
  Settings,
  TimerState_Serialize,
  TimerView_Serialize,
} from "../ipc/bindings";
import { events } from "../ipc/bindings";

/** One backend command the UI sent, with its arguments. */
export type Call = { cmd: string; args: unknown };

/** Replies for the mocked backend, keyed by command name; they replace the defaults below. */
export type Replies = Record<string, (args: unknown) => unknown>;

export type Backend = {
  /** Every non-event command, in order. */
  calls: Call[];
  /** Listener ids per event that were registered and not yet unlistened. */
  live: (event: string) => number;
  /** How many times each event was listened to, cleaned up or not. */
  listens: (event: string) => number;
  /** Every handler per event in subscription order, kept after unlisten. */
  handlers: (event: string) => Array<(event: unknown) => void>;
};

type Invoke = (cmd: string, args?: unknown, options?: unknown) => Promise<unknown>;
type Internals = { invoke: Invoke; callbacks: Map<number, (event: unknown) => void> };

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
  preset: null,
  finish: null,
  plannedMin: null,
  store: "ok",
  notifications: "granted",
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
  preset: "classic",
  finish: "15:20",
  plannedMin: 25,
};

export const PAUSED: TimerView_Serialize = {
  ...RUNNING,
  state: "paused",
  mode: "paused",
  finish: null,
};

export const SETTINGS: Settings = {
  theme: "system",
  preset: "classic",
  custom: { focusMin: 45, breakMin: 10 },
  notifySessionEnd: true,
};

const DEFAULTS: Replies = {
  app_info: () => INFO,
  spike_status: () => ({ enabled: false, platformSupported: true }),
  timer_state: (): TimerState_Serialize => ({ view: IDLE, pending: [] }),
  settings_get: () => SETTINGS,
  settings_set: () => null,
  timer_start: () => RUNNING,
  timer_pause: () => PAUSED,
  timer_resume: () => RUNNING,
  timer_stop: () => IDLE,
  navigate_take: () => null,
  notifications_request: () => "granted",
  notifications_open_settings: () => null,
};

/**
 * Installs `mockIPC` with event mocking, the default replies above overridden by `replies`, and
 * counts listen and unlisten calls per event: the event mock in @tauri-apps/api 2.12.4 never
 * removes a listener on unlisten (docs/common-issues.md), so tests unmount before `clearMocks()`.
 * `failListen` makes listening to that event reject.
 */
export function mockBackend(
  replies: Replies = {},
  { failListen }: { failListen?: string } = {},
): Backend {
  const calls: Call[] = [];
  const all: Replies = { ...DEFAULTS, ...replies };
  mockIPC(
    (cmd, args) => {
      calls.push({ cmd, args });
      const reply = all[cmd];
      if (!reply) throw new Error(`unexpected command ${cmd}`);
      return reply(args);
    },
    { shouldMockEvents: true },
  );

  const live = new Map<string, Set<number>>();
  const listens = new Map<string, number>();
  const handlers = new Map<string, Array<(event: unknown) => void>>();
  // mockIPC installs these on a global that @tauri-apps/api doesn't type.
  const internals = (window as unknown as { __TAURI_INTERNALS__: Internals }).__TAURI_INTERNALS__;
  const invoke = internals.invoke;
  internals.invoke = async (cmd, args, options) => {
    const fields = (args ?? {}) as { event?: string; eventId?: number; handler?: number };
    const event = fields.event ?? "";
    if (cmd === "plugin:event|listen") {
      listens.set(event, (listens.get(event) ?? 0) + 1);
      if (event === failListen) throw new Error("core:event:allow-listen not granted");
      const handler = internals.callbacks.get(fields.handler as number);
      if (handler) handlers.set(event, [...(handlers.get(event) ?? []), handler]);
    }
    const result = await invoke(cmd, args, options);
    if (cmd === "plugin:event|listen") {
      live.set(event, (live.get(event) ?? new Set()).add(result as number));
    }
    if (cmd === "plugin:event|unlisten") {
      live.get(event)?.delete(fields.eventId as number);
    }
    return result;
  };

  return {
    calls,
    live: (event) => live.get(event)?.size ?? 0,
    listens: (event) => listens.get(event) ?? 0,
    handlers: (event) => handlers.get(event) ?? [],
  };
}

/** The arguments of every call to `cmd`, in order. */
export function argsOf(calls: Call[], cmd: string): unknown[] {
  return calls.filter((call) => call.cmd === cmd).map((call) => call.args);
}

/** A promise with its `resolve` exposed, to hold a reply until the test releases it. */
export function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

/** Lets pending promises and the commits they cause settle. */
export async function settle(): Promise<void> {
  await act(async () => {});
}

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
      ...event,
    });
  });
}

export async function emitSettingsChanged(settings: Settings): Promise<void> {
  await act(async () => {
    await events.settingsChanged.emit(settings);
  });
}

export async function emitNavigate(page: NavigatePage): Promise<void> {
  await act(async () => {
    await events.navigate.emit({ page });
  });
}
