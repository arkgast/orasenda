import { useEffect, useState } from "react";
import { events } from "./bindings";
import { subscribe } from "./subscribe";

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

  useEffect(
    () =>
      subscribe(
        "clock-tick",
        events.clockTick.listen,
        ({ epochMs }) => setClock({ status: "ok", epochMs }),
        {
          onError: () => setClock({ status: "error" }),
        },
      ),
    [],
  );

  return clock;
}
