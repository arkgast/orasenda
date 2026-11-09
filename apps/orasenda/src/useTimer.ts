import { useEffect, useRef, useState } from "react";
import type { MilestoneEvent_Serialize, TimerView_Serialize } from "./bindings";
import { commands, events } from "./bindings";
import { subscribe } from "./subscribe";
import { push, register } from "./timerQueue";

/**
 * The timer as Rust sees it: `waiting` before the first view, `ok` with the latest view, or
 * `error` when `timer_state` or listening to `timer-tick` failed (final: no view can follow).
 */
export type TimerStateUi =
  | { status: "waiting" }
  | { status: "ok"; view: TimerView_Serialize }
  | { status: "error" };

type Options = {
  /** Every milestone: live `timer-milestone` events and the `pending` ones from `timer_state`. */
  onMilestone: (event: MilestoneEvent_Serialize) => void;
};

/**
 * Subscribes to `timer-tick` and `timer-milestone`, then calls `timer_state()`; its view is used
 * only when no tick arrived first. Its `pending` events go through the module-level queue, so an
 * instance cleaned up before its reply (StrictMode's double mount) still hands them to the live
 * one. `onMilestone` is read through a ref: a new callback never resubscribes.
 */
export function useTimer({ onMilestone }: Options): TimerStateUi {
  const [timer, setTimer] = useState<TimerStateUi>({ status: "waiting" });
  const onMilestoneRef = useRef(onMilestone);

  useEffect(() => {
    onMilestoneRef.current = onMilestone;
  });

  useEffect(() => {
    let cancelled = false;
    let tickArrived = false;
    let failed = false;
    const fail = () => {
      failed = true;
      if (!cancelled) setTimer({ status: "error" });
    };

    const unregister = register((event) => onMilestoneRef.current(event));
    const stopTick = subscribe(
      "timer-tick",
      events.timerTick.listen,
      (view) => {
        tickArrived = true;
        if (!failed) setTimer({ status: "ok", view });
      },
      { onError: fail },
    );
    const stopMilestone = subscribe("timer-milestone", events.timerMilestone.listen, push);

    commands.timerState().then(
      ({ view, pending }) => {
        // Pushed even after cleanup: this call drained them, and the live instance needs them.
        for (const event of pending) push(event);
        if (!cancelled && !tickArrived && !failed) setTimer({ status: "ok", view });
      },
      (error: unknown) => {
        console.error("timer_state failed", error);
        fail();
      },
    );

    return () => {
      cancelled = true;
      unregister();
      stopTick();
      stopMilestone();
    };
  }, []);

  return timer;
}
