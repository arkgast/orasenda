/**
 * The palette's "Set intent" row navigates to Today, then asks for the intent field here. Today
 * listens while it is mounted. A request made before Today subscribes (the same tick as the
 * navigation) is held once and taken by the next subscriber; with a listener present it is
 * delivered at once and nothing is held.
 */
const listeners = new Set<() => void>();
let pending = false;

export function requestIntentField(): void {
  if (listeners.size === 0) {
    pending = true;
    return;
  }
  for (const listener of [...listeners]) listener();
}

/** Listens for requests; returns the function that stops listening. */
export function onIntentFieldRequest(callback: () => void): () => void {
  listeners.add(callback);
  if (pending) {
    pending = false;
    queueMicrotask(callback);
  }
  return () => {
    listeners.delete(callback);
  };
}
