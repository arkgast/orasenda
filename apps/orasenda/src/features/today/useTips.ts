import { useEffect, useRef, useState } from "react";
import { useKeyboardView } from "../../app/useKeyboardView";
import type { TimerView_Serialize, TipId } from "../../ipc/bindings";
import { commands } from "../../ipc/bindings";
import type { TipInput } from "./statusLine";

/** The tip's copy (spec: Welcome and tips), at most 65 characters, with the spoken keys for VoiceOver. */
function tipInput(id: TipId, keys: { display: string; spoken: string } | null): TipInput | null {
  switch (id) {
    case "globalShortcut":
      // The keys come from `keyboard_state`; until they are known the tip waits.
      return keys
        ? {
            id,
            text: `Tip: ${keys.display} starts or pauses focus from anywhere.`,
            spoken: `Tip: ${keys.spoken} starts or pauses focus from anywhere.`,
          }
        : null;
    case "globalShortcutMenu": {
      const text = "Tip: The menu bar item starts focus from anywhere.";
      return { id, text, spoken: text };
    }
    case "focusViewKeys": {
      const text = "Tip: F key opens Focus view, full screen or floating.";
      return { id, text, spoken: text };
    }
    case "focusView":
      return {
        id,
        text: "Tip: ⇧⌘F opens full screen, ⇧⌘T the floating timer.",
        spoken: "Tip: Shift-Command-F opens full screen, Shift-Command-T the floating timer.",
      };
  }
}

function logFailure(error: unknown) {
  console.error("tip_seen failed", error);
}

function report(id: TipId, how: "gotIt" | "shown") {
  commands.tipSeen(id, how).then((result) => {
    if (result.status === "error") logFailure(result.error);
  }, logFailure);
}

/**
 * The welcome line and the one-time tips on Today. A tip shows while the view carries it, and then
 * until the next start: the answer to its second showing is a view without it, and the line stays
 * up (Shown means rendered). `useTipShown` reports it. Got it hides the tip at once and is remembered for good.
 */
export function useTips(view: TimerView_Serialize | null) {
  const keyboard = useKeyboardView().view;
  const [latched, setLatched] = useState<TipId | null>(null);
  // Got it keeps every tip off until the next start, so a tip published later never replaces it.
  const [dismissed, setDismissed] = useState(false);
  const idle = view?.state === "idle";
  const due = view?.tip ?? null;
  if (due !== null && due !== latched) setLatched(due);
  if (view !== null && !idle) {
    if (latched !== null) setLatched(null);
    if (dismissed) setDismissed(false);
  }
  const current = idle ? (due ?? latched) : null;
  const id = current !== null && !dismissed ? current : null;
  // The keys wait for both forms, so VoiceOver never reads a gap.
  const { display, spoken } = keyboard?.startPause ?? { display: null, spoken: null };
  const keys = display && spoken ? { display, spoken } : null;

  return {
    tip: id === null ? null : tipInput(id, keys),
    welcome: view?.welcome === true,
    gotIt() {
      if (id === null) return;
      setDismissed(true);
      setLatched(null);
      report(id, "gotIt");
    },
  };
}

/**
 * Reports the tip once per launch, when it is on screen: `tipId` is the tip of the line Today ended
 * up with, `onScreen` whether the window shows it.
 */
export function useTipShown(tipId: TipId | null, onScreen: boolean) {
  const reported = useRef(new Set<TipId>());
  useEffect(() => {
    if (tipId === null || !onScreen || reported.current.has(tipId)) return;
    reported.current.add(tipId);
    report(tipId, "shown");
  }, [tipId, onScreen]);
}
