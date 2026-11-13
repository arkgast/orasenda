import type { EventCallback, UnlistenFn } from "@tauri-apps/api/event";

type Hooks = {
  /** The listener is attached (not called after cleanup). */
  onListening?: () => void;
  /** Listening failed; already logged (not called after cleanup). */
  onError?: (error: unknown) => void;
};

/**
 * Listens to a generated event (`events.x.listen`) and returns the cleanup for a `useEffect`.
 * The handler gets only payloads delivered before cleanup, and cleanup unlistens also when it
 * comes before `listen` resolves (StrictMode's double mount), so one listener stays live.
 * Failures to listen or unlisten go to `console.error` with the event `name`.
 */
export function subscribe<T>(
  name: string,
  listen: (callback: EventCallback<T>) => Promise<UnlistenFn>,
  handler: (payload: T) => void,
  { onListening, onError }: Hooks = {},
): () => void {
  let cancelled = false;
  const listening = listen((event) => {
    if (!cancelled) handler(event.payload);
  });
  listening.then(
    () => {
      if (!cancelled) onListening?.();
    },
    (error: unknown) => {
      console.error(`${name} listen failed`, error);
      if (!cancelled) onError?.(error);
    },
  );
  return () => {
    cancelled = true;
    listening.then(
      // `UnlistenFn` is typed `() => void` but returns a promise at runtime.
      (unlisten) =>
        Promise.resolve(unlisten()).catch((error: unknown) =>
          console.error(`${name} unlisten failed`, error),
        ),
      // Already logged above; there is nothing to unlisten.
      () => {},
    );
  };
}
