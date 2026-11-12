/**
 * The palette's "Set intent" row navigates to Today, then asks for the intent field here. Today
 * listens while it is mounted; a request nobody hears is dropped, so the field never opens by
 * itself later.
 */
const listeners = new Set<() => void>();

export function requestIntentField(): void {
  for (const listener of [...listeners]) listener();
}

/** Listens for requests; returns the function that stops listening. */
export function onIntentFieldRequest(callback: () => void): () => void {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}
