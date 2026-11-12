import { useEffect, useState } from "react";
import type { TimerView_Serialize } from "../../ipc/bindings";
import { commands, events } from "../../ipc/bindings";
import { subscribe } from "../../ipc/subscribe";

/** What a Focus window or the floater shows of the timer. */
export type SurfaceTimer = {
  /** The latest view; `null` until the first one arrives. */
  view: TimerView_Serialize | null;
  /** A session ended and no new one has started since. */
  ended: boolean;
  /** No view could be read: `timer_view` failed and no tick came. */
  failed: boolean;
};

/**
 * The timer for a surface that only displays it (ADR-013): the first `timer_view`, then every
 * `timer-tick`, and `timer-milestone` for the end of a session. It never calls `timer_state`,
 * which would take the milestones Today is waiting for. A tick that arrives before the first
 * reply wins. `ended` is set by an `ended` milestone and cleared by the next non-idle view.
 */
export function useSurfaceTimer(): SurfaceTimer {
  const [view, setView] = useState<TimerView_Serialize | null>(null);
  const [ended, setEnded] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let tickArrived = false;
    const show = (next: TimerView_Serialize) => {
      setView(next);
      setFailed(false);
      if (next.state !== "idle") setEnded(false);
    };

    const stopTick = subscribe("timer-tick", events.timerTick.listen, (next) => {
      tickArrived = true;
      show(next);
    });
    const stopMilestone = subscribe("timer-milestone", events.timerMilestone.listen, (event) => {
      if (event.kind === "ended") setEnded(true);
    });

    commands.timerView().then(
      (first) => {
        if (!cancelled && !tickArrived) show(first);
      },
      (error: unknown) => {
        console.error("timer_view failed", error);
        if (!cancelled && !tickArrived) setFailed(true);
      },
    );

    return () => {
      cancelled = true;
      stopTick();
      stopMilestone();
    };
  }, []);

  return { view, ended, failed };
}
