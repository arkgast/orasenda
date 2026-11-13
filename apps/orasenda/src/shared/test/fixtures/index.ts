import { mockIPC } from "@tauri-apps/api/mocks";
import { act } from "@testing-library/react";
import type { AppInfo, DisplayInfo, NoteView, TimerState_Serialize } from "../../ipc/bindings";
import { events } from "../../ipc/bindings";
import { DATA_REPLIES } from "./data";
import { KEYBOARD } from "./keyboard";
import { BREAK, IDLE, PAUSED, PRESETS, RUNNING, SETTINGS } from "./timer";

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

/** Two Inbox notes, newest first, as `inbox_list` answers. */
export const NOTES: NoteView[] = [
  {
    id: "note-2",
    text: "Email the landlord about the lease",
    kind: "external",
    createdAt: "14:32",
    createdAtLabel: "Today at 14:32",
  },
  {
    id: "note-1",
    text: "Try the smaller timer ring",
    kind: "internal",
    createdAt: "Yesterday 09:05",
    createdAtLabel: "Yesterday at 09:05",
  },
];

/** Two connected displays, the main window's first (`displays_list`). */
export const DISPLAYS: DisplayInfo[] = [
  { id: "1", name: "Built-in Retina Display", hasMainWindow: true },
  { id: "2", name: "DELL U2720Q", hasMainWindow: false },
];

const DEFAULTS: Replies = {
  app_info: () => INFO,
  spike_status: () => ({ enabled: false, platformSupported: true }),
  timer_state: (): TimerState_Serialize => ({ view: IDLE, pending: [] }),
  settings_get: () => SETTINGS,
  settings_set: () => null,
  keyboard_state: () => KEYBOARD,
  keyboard_recording: () => undefined,
  timer_start: () => RUNNING,
  timer_pause: () => PAUSED,
  timer_resume: () => RUNNING,
  timer_stop: () => IDLE,
  timer_extend: () => RUNNING,
  timer_dismiss_offer: () => IDLE,
  timer_take_break: () => BREAK,
  hint_shown: () => RUNNING,
  tip_seen: () => IDLE,
  navigate_take: () => null,
  presets_list: () => PRESETS,
  inbox_list: () => NOTES,
  inbox_remove: () => null,
  inbox_restore: () => null,
  capture_open: () => null,
  action_run: () => undefined,
  capture_close: () => null,
  capture_note: (args) => ({ ...NOTES[0], text: (args as { note: { text: string } }).note.text }),
  notifications_request: () => "granted",
  notifications_open_settings: () => null,
  timer_view: () => IDLE,
  displays_list: () => DISPLAYS,
  focus_view_open: () => null,
  focus_view_close: () => null,
  main_show: () => null,
  preset_select: () => null,
  ...DATA_REPLIES,
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

export async function emitInboxChanged(notes: NoteView[]): Promise<void> {
  await act(async () => {
    await events.inboxChanged.emit(notes);
  });
}

export * from "./data";
export * from "./keyboard";
export * from "./timer";
