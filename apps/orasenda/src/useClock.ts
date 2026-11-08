import { useEffect, useState } from "react";
import { events } from "./bindings";

/**
 * Epoch milliseconds (UTC) of the latest `clock-tick` from Rust, or `null` before the first one.
 * Subscribes on mount and unsubscribes on unmount, also when unmount comes before `listen`
 * resolves (StrictMode's double mount), so exactly one listener stays live.
 */
export function useClock(): number | null {
  const [epochMs, setEpochMs] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const listening = events.clockTick.listen((event) => {
      if (!cancelled) setEpochMs(event.payload.epochMs);
    });
    listening.catch((error: unknown) => console.error("clock-tick listen failed", error));
    return () => {
      cancelled = true;
      listening
        .then((unlisten) => unlisten())
        .catch((error: unknown) => console.error("clock-tick unlisten failed", error));
    };
  }, []);

  return epochMs;
}
