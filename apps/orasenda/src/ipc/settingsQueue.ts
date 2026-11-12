import type { Settings } from "./bindings";
import { commands, events } from "./bindings";
import { subscribe } from "./subscribe";

// The settings save chain (docs/conventions.md, "Newest wins"; #101, #113).
// `intended` is the latest value the user asked for, set synchronously, so a change made while a
// settings_set is in flight builds on it, never on a stale render. `accepted` is the last value
// Rust took, which a failed write rolls back to. Calls are chained, never overlapped: at most one
// settings_get or settings_set is in flight, and when it answers, the latest `intended` is sent
// next if Rust doesn't hold it yet. So Rust applies saves in the order they were meant, and every
// answer is judged against a settled store.
//
// Module-level on purpose: the chain must outlive the page (a save queued before the user left
// Today is still sent), and only one caller may talk to SessionService at a time, so a remounted
// Today waits behind the old one's save. One listener slot, because one Today is live per window.

/** `true` when `Keys` lists every key of `T`; any key left out makes it `false`. */
export type CoversEveryKey<T, Keys extends readonly (keyof T)[]> = [
  Exclude<keyof T, Keys[number]>,
] extends [never]
  ? true
  : false;

/** Fails to compile unless `Check` is `true`. */
type AssertTrue<Check extends true> = Check;

/**
 * Every `Settings` field, compared by `sameSettings`. A field added to the generated type
 * must be listed here, or a change to only that field would never be sent (#114).
 */
export const SETTINGS_KEYS = [
  "theme",
  "presetId",
  "extensionCap",
  "autoContinue",
  "longestFocusMin",
  "deepCapOn",
  "deepCapHours",
  "notifySessionEnd",
  "notifyTwoMinutes",
] as const satisfies readonly (keyof Settings)[];

// Compile-time exhaustiveness (#114): `tsc` fails here when bindings.ts gains a field this list misses.
export type SettingsKeysAreComplete = AssertTrue<CoversEveryKey<Settings, typeof SETTINGS_KEYS>>;

// Every field must be a primitive, or `sameSettings` would compare it by reference; an object
// field fails to compile here until it gets its own compare.
export type SettingsArePrimitive = AssertTrue<
  [Settings[keyof Settings]] extends [string | number | boolean | null] ? true : false
>;

function sameSettings(a: Settings | null, b: Settings | null): boolean {
  if (!a || !b) return a === b;
  return SETTINGS_KEYS.every((key) => a[key] === b[key]);
}

/** What the live page is told. */
export type SettingsListener = {
  /** The settings to show. `resetDraft`: a field being typed in must show the saved value. */
  shown: (settings: Settings, resetDraft: boolean) => void;
  /** The latest intent was written. */
  accepted: () => void;
  /** settings_get failed and there is nothing to show. */
  loadFailed: () => void;
  /**
   * A save failed and Rust still holds `restored`; called just before the page is rolled back to
   * it. A promise rejection reports as `write`.
   */
  saveFailed: (sent: Settings, restored: Settings, kind: "write" | "unavailable") => void;
};

let listener: SettingsListener | null = null;
let intended: Settings | null = null;
let accepted: Settings | null = null;
let busy = false;
let getWanted = false;
// The intent a get in flight was sent under; `null` when no get is in flight.
let getSentUnder: { intent: Settings | null } | null = null;
// Bumped by the test reset: a reply from an earlier generation is dropped.
let generation = 0;
// The one `settings-changed` subscription, made on first use (not at import, before any IPC
// exists) and kept for the module's life; `watchers` share it.
let stopChanged: (() => void) | null = null;
const watchers = new Set<(settings: Settings) => void>();

function ensureSubscribed(): void {
  if (stopChanged) return;
  stopChanged = subscribe("settings-changed", events.settingsChanged.listen, (settings) => {
    for (const watcher of watchers) watcher(settings);
    load();
  });
}

/** Calls `watcher` on each `settings-changed`, through the queue's single listener. */
export function watchSettingsChanged(watcher: (settings: Settings) => void): () => void {
  ensureSubscribed();
  watchers.add(watcher);
  return () => {
    watchers.delete(watcher);
  };
}

/**
 * Makes `next` the live listener and shows it the current intent, if there is one. The returned
 * cleanup empties the slot only if `next` still holds it.
 */
export function register(next: SettingsListener): () => void {
  ensureSubscribed();
  listener = next;
  if (intended) next.shown(intended, true);
  return () => {
    if (listener === next) listener = null;
  };
}

/** The latest intent (what a change builds on), or `null` before the first load. */
export function latest(): Settings | null {
  return intended;
}

/**
 * Queues one settings_get behind any save; a second call while one is queued, or in flight with no
 * change since, is a no-op.
 */
export function load(): void {
  ensureSubscribed();
  if (getSentUnder && getSentUnder.intent === intended) return;
  getWanted = true;
  pump();
}

/** Makes `next` the latest intent, tells the live page, and sends it when the lane is free. */
export function save(next: Settings): void {
  intended = next;
  listener?.shown(next, false);
  pump();
}

/** Empties all state and drops replies still in flight (Vitest shares this module within a file). */
export function resetSettingsQueueForTests(): void {
  generation += 1;
  stopChanged?.();
  stopChanged = null;
  watchers.clear();
  listener = null;
  intended = null;
  accepted = null;
  busy = false;
  getWanted = false;
  getSentUnder = null;
}

/** Rolls back to what Rust holds; changes queued behind a failed save are dropped too. */
function rollBack(): void {
  if (!accepted) return;
  intended = accepted;
  listener?.shown(accepted, true);
}

function pump(): void {
  if (busy) return;
  const next = intended;
  if (next && !sameSettings(next, accepted)) {
    sendSave(next);
  } else if (getWanted) {
    sendGet();
  }
}

function sendSave(next: Settings): void {
  busy = true;
  const mine = generation;
  const failed = (error: unknown, kind: "write" | "unavailable" = "write") => {
    if (mine !== generation) return;
    console.error("settings_set failed", error);
    if (accepted) listener?.saveFailed(next, accepted, kind);
    rollBack();
  };
  commands
    .settingsSet(next)
    .then(
      (result) => {
        if (mine !== generation) return;
        if (result.status === "ok") {
          accepted = next;
          if (sameSettings(intended, next)) listener?.accepted();
        } else {
          // `invalidSpec` is a value Rust refused (a preset no longer in the library): it
          // rolls back like a failed write.
          failed(result.error, result.error.kind === "unavailable" ? "unavailable" : "write");
        }
      },
      (error: unknown) => failed(error),
    )
    .finally(() => {
      if (mine !== generation) return;
      busy = false;
      pump();
    });
}

function sendGet(): void {
  busy = true;
  getWanted = false;
  const mine = generation;
  const before = intended;
  getSentUnder = { intent: before };
  commands
    .settingsGet()
    .then(
      (saved) => {
        if (mine !== generation) return;
        accepted = saved;
        // A change made while the get was in flight is kept and sent next.
        if (intended === before) {
          // Reset the draft only when the page shows something else: text typed during a long save stays.
          const differs = !sameSettings(saved, intended);
          intended = saved;
          if (differs) listener?.shown(saved, true);
        }
      },
      (error: unknown) => {
        if (mine !== generation) return;
        console.error("settings_get failed", error);
        if (!intended) listener?.loadFailed();
      },
    )
    .finally(() => {
      if (mine !== generation) return;
      busy = false;
      getSentUnder = null;
      pump();
    });
}
