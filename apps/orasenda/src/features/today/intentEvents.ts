/**
 * The palette's "Set intent" row navigates to Today, then asks for the intent field here. Today
 * listens while it is mounted. A request made before Today subscribes (the same tick as the
 * navigation) is held and taken by the next subscriber; with a listener present it is delivered
 * at once and nothing is held. A held request expires after `HOLD_MS`: if Today did not mount in
 * that window (it was not reachable), a later visit must not open the field out of the blue.
 */
const HOLD_MS = 1000;
const listeners = new Set<() => void>();
let pending = false;
let expiry: ReturnType<typeof setTimeout> | undefined;

function drop(): void {
  pending = false;
  clearTimeout(expiry);
  expiry = undefined;
}

export function requestIntentField(): void {
  if (listeners.size === 0) {
    pending = true;
    clearTimeout(expiry);
    expiry = setTimeout(drop, HOLD_MS);
    return;
  }
  for (const listener of [...listeners]) listener();
}

/** Listens for requests; returns the function that stops listening. */
export function onIntentFieldRequest(callback: () => void): () => void {
  listeners.add(callback);
  if (pending) {
    drop();
    queueMicrotask(callback);
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
