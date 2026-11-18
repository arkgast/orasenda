import { commands, events, type StatsRange, type StatsView_Serialize } from "@shared/ipc/bindings";
import { subscribe } from "@shared/ipc/subscribe";
import { useCallback, useEffect, useRef, useState } from "react";

/** `view` is the last one read, kept while a newer read is on its way or has failed. */
export type Stats =
  | { status: "loading"; view: null }
  | { status: "error"; view: StatsView_Serialize | null }
  | { status: "ok"; view: StatsView_Serialize };

/**
 * The stats for `range` from `review_stats`, read on mount, on a range change, and on
 * `review-changed`, `routines-changed`, `board-changed` and `timer-milestone` `ended` (a session
 * with no task emits no `board-changed`, so the bars still need that one). One call is in flight;
 * a change while it runs sends one more read after it, and the earlier reply is dropped (newest
 * wins, docs/conventions.md).
 */
export function useStats(range: StatsRange) {
  const [stats, setStats] = useState<Stats>({ status: "loading", view: null });
  const wanted = useRef(range);
  const busy = useRef(false);
  const dirty = useRef(false);
  const live = useRef(true);
  const last = useRef<StatsView_Serialize | null>(null);

  const read = useCallback(function read(): void {
    if (busy.current) {
      dirty.current = true;
      return;
    }
    busy.current = true;
    dirty.current = false;
    const finish = (apply: () => void) => {
      busy.current = false;
      if (!live.current) return;
      if (dirty.current) read();
      else apply();
    };
    const failed = (error: unknown) =>
      finish(() => {
        console.error("review_stats failed", error);
        setStats({ status: "error", view: last.current });
      });
    commands.reviewStats(wanted.current).then((result) => {
      if (result.status === "error") return failed(result.error);
      finish(() => {
        last.current = result.data;
        setStats({ status: "ok", view: result.data });
      });
    }, failed);
  }, []);

  useEffect(() => {
    live.current = true;
    const stops = [
      subscribe("review-changed", events.reviewChanged.listen, read),
      subscribe("routines-changed", events.routinesChanged.listen, read),
      subscribe("board-changed", events.boardChanged.listen, read),
      subscribe("timer-milestone", events.timerMilestone.listen, ({ kind }) => {
        if (kind === "ended") read();
      }),
    ];
    return () => {
      live.current = false;
      for (const stop of stops) stop();
    };
  }, [read]);

  useEffect(() => {
    wanted.current = range;
    read();
  }, [range, read]);

  return { stats, refresh: read };
}
