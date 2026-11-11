import { useEffect, useState } from "react";
import { events } from "../../ipc/bindings";
import { subscribe } from "../../ipc/subscribe";

/**
 * The wall clock from Rust: `waiting` before the first `clock-tick`, `ok` with the latest tick
 * (epoch milliseconds in UTC, the clock as text and the idle finish preview, both formatted by
 * Rust), or `error` when subscribing failed (final: no tick can follow).
 */
export type ClockState =
  | { status: "waiting" }
  | { status: "ok"; epochMs: number; clock: string; idleFinish: string | null }
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
        ({ epochMs, clock, idleFinish }) => setClock({ status: "ok", epochMs, clock, idleFinish }),
        {
          onError: () => setClock({ status: "error" }),
        },
      ),
    [],
  );

  return clock;
}
