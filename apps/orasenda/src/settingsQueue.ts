import type { CustomSpec, TimerSettings } from "./bindings";
import { commands } from "./bindings";

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

/** Every `CustomSpec` field, compared by `sameCustom`. */
export const CUSTOM_KEYS = [
  "focusMin",
  "breakMin",
] as const satisfies readonly (keyof CustomSpec)[];

/**
 * Every `TimerSettings` field, compared by `sameSettings`. A field added to the generated type
 * must be listed here, or a change to only that field would never be sent (#114).
 */
export const SETTINGS_KEYS = [
  "preset",
  "custom",
  "notifySessionEnd",
] as const satisfies readonly (keyof TimerSettings)[];

// Compile-time exhaustiveness (#114): `tsc` fails here when bindings.ts gains a field these lists miss.
export type CustomKeysAreComplete = AssertTrue<CoversEveryKey<CustomSpec, typeof CUSTOM_KEYS>>;
export type SettingsKeysAreComplete = AssertTrue<
  CoversEveryKey<TimerSettings, typeof SETTINGS_KEYS>
>;

// A new non-`custom` field must be a primitive, or `sameSettings` would compare it by reference;
// an object field fails to compile here until it gets its own compare.
export type OtherSettingsArePrimitive = AssertTrue<
  [
    Exclude<
      TimerSettings[Exclude<keyof TimerSettings, "custom">],
      string | number | boolean | null
    >,
  ] extends [never]
    ? true
    : false
>;

export function sameCustom(a: CustomSpec, b: CustomSpec): boolean {
  return CUSTOM_KEYS.every((key) => a[key] === b[key]);
}

function sameSettings(a: TimerSettings | null, b: TimerSettings | null): boolean {
  if (!a || !b) return a === b;
  // `custom` is the one object field; a new object field needs its own compare here.
  return SETTINGS_KEYS.every((key) =>
    key === "custom" ? sameCustom(a.custom, b.custom) : a[key] === b[key],
  );
}

/** What the live page is told. */
export type SettingsListener = {
  /** The settings to show. `resetDraft`: the Custom fields must show `settings.custom`. */
  shown: (settings: TimerSettings, resetDraft: boolean) => void;
  /** The latest intent was written: earlier range helpers no longer apply. */
  accepted: () => void;
  /** Rust refused this spec as out of range; the draft stays as typed. */
  refused: (custom: CustomSpec) => void;
  /** settings_get failed and there is nothing to show. */
  loadFailed: () => void;
};

let listener: SettingsListener | null = null;
let intended: TimerSettings | null = null;
let accepted: TimerSettings | null = null;
let busy = false;
let getWanted = false;
// Bumped by the test reset: a reply from an earlier generation is dropped.
let generation = 0;

/**
 * Makes `next` the live listener and shows it the current intent, if there is one. The returned
 * cleanup empties the slot only if `next` still holds it.
 */
export function register(next: SettingsListener): () => void {
  listener = next;
  if (intended) next.shown(intended, true);
  return () => {
    if (listener === next) listener = null;
  };
}

/** The latest intent (what a change builds on), or `null` before the first load. */
export function latest(): TimerSettings | null {
  return intended;
}

/** Queues one settings_get behind any save; a second call while one is queued is a no-op. */
export function load(): void {
  getWanted = true;
  pump();
}

/** Makes `next` the latest intent, tells the live page, and sends it when the lane is free. */
export function save(next: TimerSettings): void {
  intended = next;
  listener?.shown(next, false);
  pump();
}

/** Empties all state and drops replies still in flight (Vitest shares this module within a file). */
export function resetSettingsQueueForTests(): void {
  generation += 1;
  listener = null;
  intended = null;
  accepted = null;
  busy = false;
  getWanted = false;
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

function sendSave(next: TimerSettings): void {
  busy = true;
  const mine = generation;
  const failed = (error: unknown) => {
    if (mine !== generation) return;
    console.error("settings_set failed", error);
    rollBack();
  };
  commands
    .settingsSet(next)
    .then((result) => {
      if (mine !== generation) return;
      if (result.status === "ok") {
        accepted = next;
        if (sameSettings(intended, next)) listener?.accepted();
      } else if (result.error.kind === "invalidSpec") {
        const current = intended;
        // A spec typed since this one was sent replaces it, and its own save decides.
        if (!current || !sameCustom(current.custom, next.custom) || !accepted) return;
        // Keep the typed draft beside the helper, but never resend the rejected spec.
        intended = { ...current, custom: accepted.custom };
        listener?.refused(next.custom);
      } else {
        failed(result.error);
      }
    }, failed)
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
  commands
    .settingsGet()
    .then(
      (saved) => {
        if (mine !== generation) return;
        accepted = saved;
        // A change made while the get was in flight is kept and sent next.
        if (intended === before) {
          intended = saved;
          listener?.shown(saved, true);
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
      pump();
    });
}
