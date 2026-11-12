import { useEffect, useRef, useState } from "react";
import { commands, type TimerView_Serialize } from "../../ipc/bindings";

/**
 * The keep-going hint on Today. It shows while the view carries it, and then for the rest of that
 * focus: the first `hint_shown` answers a view without it, and the line stays up (spec: Shown
 * means rendered). `rendered` says the line is actually on screen; the first time it is, the hint
 * is reported once.
 */
export function useKeepGoingHint(view: TimerView_Serialize | null, rendered: boolean): boolean {
  const [latched, setLatched] = useState<string | null>(null);
  const reported = useRef(false);
  const hinted = view?.hint === "keepGoing";
  if (hinted && view?.sessionId && latched !== view.sessionId) setLatched(view.sessionId);
  const due =
    hinted ||
    (latched !== null && view !== null && view.sessionId === latched && view.state !== "idle");

  useEffect(() => {
    if (!rendered || reported.current) return;
    reported.current = true;
    commands.hintShown("keepGoing").then(
      (result) => {
        if (result.status === "error") console.error("hint_shown failed", result.error);
      },
      (error: unknown) => console.error("hint_shown failed", error),
    );
  }, [rendered]);

  return due;
}
