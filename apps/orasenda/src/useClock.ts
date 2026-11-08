import { useEffect, useState } from "react";
import { events } from "./bindings";

/**
 * The wall clock from Rust: `waiting` before the first `clock-tick`, `ok` with the latest tick's
 * epoch milliseconds (UTC), or `error` when subscribing failed (final: no tick can follow).
 */
export type ClockState =
  | { status: "waiting" }
  | { status: "ok"; epochMs: number }
  | { status: "error" };

/**
 * Subscribes to `clock-tick` on mount and unsubscribes on unmount, also when unmount comes
 * before `listen` resolves (StrictMode's double mount), so exactly one listener stays live.
 */
export function useClock(): ClockState {
  const [clock, setClock] = useState<ClockState>({ status: "waiting" });

  useEffect(() => {
    let cancelled = false;
    const listening = events.clockTick.listen((event) => {
      if (!cancelled) setClock({ status: "ok", epochMs: event.payload.epochMs });
    });
    listening.catch((error: unknown) => {
      console.error("clock-tick listen failed", error);
      if (!cancelled) setClock({ status: "error" });
    });
    return () => {
      cancelled = true;
      listening.then(
        // `UnlistenFn` is typed `() => void` but returns a promise at runtime.
        (unlisten) =>
          Promise.resolve(unlisten()).catch((error: unknown) =>
            console.error("clock-tick unlisten failed", error),
          ),
        // Already logged and shown as `error` above; there is nothing to unlisten.
        () => {},
      );
    };
  }, []);

  return clock;
}
