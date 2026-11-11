import type { NotificationStatus } from "../../ipc/bindings";
import { commands } from "../../ipc/bindings";
import { latest, save } from "../../ipc/settingsQueue";

// The Notifications checkbox's behaviour (spec B, "notificationsToggle.ts"). Module-level so it
// outlives the page, like the save chain. `request` numbers each ask: an answer that is not
// the newest is dropped, so an untick while asking is never undone by a late reply.

let asking = false;
let request = 0;
const listeners = new Set<() => void>();

function setAsking(value: boolean): void {
  if (asking === value) return;
  asking = value;
  for (const listener of listeners) listener();
}

export function isAsking(): boolean {
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
  asking = false;
  listeners.clear();
}

function setPreference(notifySessionEnd: boolean): void {
  const current = latest();
  if (current) save({ ...current, notifySessionEnd });
}

/** Asks macOS; `saveOnGranted` is false for "Ask macOS" (the preference is already on). */
function ask(saveOnGranted: boolean): void {
  const mine = ++request;
  setAsking(true);
  commands.notificationsRequest().then(
    (status) => {
      if (mine !== request) return;
      if (status === "granted" && saveOnGranted) setPreference(true);
      setAsking(false);
    },
    (error: unknown) => {
      console.error("notifications_request failed", error);
      if (mine === request) setAsking(false);
    },
  );
}

/** The box was ticked while the status is `status`. */
export function tick(status: NotificationStatus): void {
  if (status === "notDetermined") ask(true);
  else setPreference(true);
}

/** The box was unticked (also while asking). */
export function untick(): void {
  request += 1;
  setAsking(false);
  setPreference(false);
}

/** The quiet "Ask macOS" action: the preference is on, macOS hasn't been asked. */
export function askMacOS(): void {
  ask(false);
}
