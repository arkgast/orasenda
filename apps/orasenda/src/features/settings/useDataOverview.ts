import type { DataOverview } from "@shared/ipc/bindings";
import { commands, events } from "@shared/ipc/bindings";
import { subscribe } from "@shared/ipc/subscribe";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * What the Your data and Backups panes show: `data_overview` once on mount, then every
 * `backups-changed` payload. `refresh` reads it again (after an error, say).
 */
export function useDataOverview(): {
  overview: DataOverview | null;
  error: boolean;
  refresh(): void;
} {
  const [overview, setOverview] = useState<DataOverview | null>(null);
  const [error, setError] = useState(false);
  // A reply that left before a newer event must not replace it.
  const generation = useRef(0);
  const alive = useRef(true);

  const refresh = useCallback(() => {
    const started = ++generation.current;
    commands.dataOverview().then(
      (next) => {
        if (!alive.current || started !== generation.current) return;
        setOverview(next);
        setError(false);
      },
      (failure: unknown) => {
        console.error("data_overview failed", failure);
        if (alive.current && started === generation.current) setError(true);
      },
    );
  }, []);

  useEffect(() => {
    alive.current = true;
    const stop = subscribe("backups-changed", events.backupsChanged.listen, (next) => {
      generation.current += 1;
      setOverview(next);
      setError(false);
    });
    refresh();
    return () => {
      alive.current = false;
      stop();
    };
  }, [refresh]);

  return { overview, error, refresh };
}
