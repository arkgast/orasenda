import type { NotificationStatus } from "@shared/ipc/bindings";
import { commands } from "@shared/ipc/bindings";
import { latest, save } from "@shared/ipc/settingsQueue";

// The Notifications checkbox's behaviour (spec B, "notificationsToggle.ts"). Module-level so it
// outlives the page, like the save chain. `request` numbers each ask: an answer that is not
// the newest is dropped, so an untick while asking is never undone by a late reply.

/** The two notification preferences a box can ask macOS for. */
export type NotifyKey = "notifySessionEnd" | "notifyTwoMinutes";

let asking: NotifyKey | null = null;
let request = 0;
/** Boxes ticked during the one pending ask; all are saved when macOS says yes. */
const pending = new Set<NotifyKey>();
const listeners = new Set<() => void>();
let pendingSnapshot: readonly NotifyKey[] = [];

function emit(): void {
  const next = [...pending].sort();
  if (next.join() !== pendingSnapshot.join()) pendingSnapshot = next;
  for (const listener of listeners) listener();
}

export function isAsking(): boolean {
  return asking !== null;
}

/** Which box is waiting on the macOS prompt, for `useSyncExternalStore`. */
export function askingKey(): NotifyKey | null {
  return asking;
}

/** Boxes ticked and waiting on the ask, for `useSyncExternalStore` (a new array on change). */
export function pendingKeys(): readonly NotifyKey[] {
  return pendingSnapshot;
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
  inFlight = null;
  pending.clear();
  pendingSnapshot = [];
  listeners.clear();
}

function setPreference(key: NotifyKey, value: boolean): Promise<boolean> {
  const current = latest();
  return current ? save({ ...current, [key]: value }) : Promise.resolve(false);
}

// The ask in flight, so a tick that joins it gets the same result.
let inFlight: Promise<boolean> | null = null;

/**
 * Asks macOS. Resolves `true` when every save after a grant worked, when the person declined, or
 * when a newer action replaced the ask (a decline is a choice, not a failure); `false` when the
 * request failed or a save was rolled back.
 */
function ask(key: NotifyKey, saveOnGranted: boolean): Promise<boolean> {
  const mine = ++request;
  // The quiet "Ask macOS" action is for a preference already on: only ticks that join it are held.
  if (saveOnGranted) pending.add(key);
  asking = key;
  emit();
  const result = commands.notificationsRequest().then(
    (status) => {
      if (mine !== request) return true;
      const keys = status === "granted" ? [...pending] : [];
      pending.clear();
      asking = null;
      emit();
      return Promise.all(keys.map((each) => setPreference(each, true))).then((all) =>
        all.every(Boolean),
      );
    },
    (error: unknown) => {
      console.error("notifications_request failed", error);
      if (mine !== request) return true;
      pending.clear();
      asking = null;
      emit();
      return false;
    },
  );
  inFlight = result;
  void result.then(() => {
    if (inFlight === result) inFlight = null;
  });
  return result;
}

/** The box was ticked while the status is `status`; see `ask` for what the result means. */
export function tick(
  status: NotificationStatus,
  key: NotifyKey = "notifySessionEnd",
): Promise<boolean> {
  if (status === "notDetermined" && asking !== null) {
    pending.add(key);
    emit();
    return inFlight ?? Promise.resolve(true);
  }
  if (status === "notDetermined") return ask(key, true);
  return setPreference(key, true);
}

/** The box was unticked (also while asking). */
export function untick(key: NotifyKey = "notifySessionEnd"): Promise<boolean> {
  pending.delete(key);
  if (asking === key) {
    // The box that was asking is off; a box that joined it keeps the ask alive.
    const next = [...pending][0] ?? null;
    if (next === null) request += 1;
    asking = next;
  }
  emit();
  return setPreference(key, false);
}

/** The quiet "Ask macOS" action: the preference is on, macOS hasn't been asked. */
export function askMacOS(): void {
  void ask("notifySessionEnd", false);
}
