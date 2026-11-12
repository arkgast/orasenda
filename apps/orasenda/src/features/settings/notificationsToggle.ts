import type { NotificationStatus } from "../../ipc/bindings";
import { commands } from "../../ipc/bindings";
import { latest, save } from "../../ipc/settingsQueue";

// The Notifications checkbox's behaviour (spec B, "notificationsToggle.ts"). Module-level so it
// outlives the page, like the save chain. `request` numbers each ask: an answer that is not
// the newest is dropped, so an untick while asking is never undone by a late reply.

/** The two notification preferences a box can ask macOS for. */
export type NotifyKey = "notifySessionEnd" | "notifyTwoMinutes";

let asking: NotifyKey | null = null;
let request = 0;
const listeners = new Set<() => void>();

function setAsking(value: NotifyKey | null): void {
  if (asking === value) return;
  asking = value;
  for (const listener of listeners) listener();
}

export function isAsking(): boolean {
  return asking !== null;
}

/** Which box is waiting on the macOS prompt, for `useSyncExternalStore`. */
export function askingKey(): NotifyKey | null {
  return asking;
}

/** For `useSyncExternalStore`. */
export function subscribeAsking(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function resetNotificationsToggleForTests(): void {
  request += 1;
  asking = null;
  listeners.clear();
}

function setPreference(key: NotifyKey, value: boolean): void {
  const current = latest();
  if (current) save({ ...current, [key]: value });
}

/** Asks macOS; `saveOnGranted` is false for "Ask macOS" (the preference is already on). */
function ask(key: NotifyKey, saveOnGranted: boolean): void {
  const mine = ++request;
  setAsking(key);
  commands.notificationsRequest().then(
    (status) => {
      if (mine !== request) return;
      if (status === "granted" && saveOnGranted) setPreference(key, true);
      setAsking(null);
    },
    (error: unknown) => {
      console.error("notifications_request failed", error);
      if (mine === request) setAsking(null);
    },
  );
}

/** The box was ticked while the status is `status`. */
export function tick(status: NotificationStatus, key: NotifyKey = "notifySessionEnd"): void {
  if (status === "notDetermined") ask(key, true);
  else setPreference(key, true);
}

/** The box was unticked (also while asking). */
export function untick(key: NotifyKey = "notifySessionEnd"): void {
  request += 1;
  setAsking(null);
  setPreference(key, false);
}

/** The quiet "Ask macOS" action: the preference is on, macOS hasn't been asked. */
export function askMacOS(): void {
  ask("notifySessionEnd", false);
}
