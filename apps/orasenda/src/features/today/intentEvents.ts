/**
 * The palette's "Set intent" row navigates to Today, then asks for the intent field here. Today
 * listens while it is mounted. A request made before Today subscribes (the same tick as the
 * navigation) is held and taken by the next subscriber; with a listener present it is delivered
 * at once and nothing is held. A held request expires after `HOLD_MS`: if Today did not mount in
 * that window (it was not reachable), a later visit must not open the field out of the blue.
 */
const HOLD_MS = 1000;
const listeners = new Set<() => boolean>();
let pending = false;
let expiry: ReturnType<typeof setTimeout> | undefined;

function drop(): void {
  pending = false;
  clearTimeout(expiry);
  expiry = undefined;
}

export function requestIntentField(): void {
  for (const listener of [...listeners]) {
    if (listener()) {
      drop();
      return;
    }
  }
  // Nobody could take it yet (Today is not mounted, or its timer has not replied): keep it briefly.
  pending = true;
  clearTimeout(expiry);
  expiry = setTimeout(drop, HOLD_MS);
}

/** Takes a held request, if one is still pending. Today calls this once it can edit the intent. */
export function claimIntentRequest(): boolean {
  const had = pending;
  drop();
  return had;
}

/** Listens for requests; the callback returns whether it took one. Returns the stop function. */
export function onIntentFieldRequest(callback: () => boolean): () => void {
  listeners.add(callback);
  if (pending) {
    queueMicrotask(() => {
      if (pending && callback()) drop();
    });
  }
  return () => {
    listeners.delete(callback);
  };
}

/** Forgets every listener and any held request, so one test leaves nothing for the next. */
export function resetIntentEventsForTests(): void {
  listeners.clear();
  drop();
}
