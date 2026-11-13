import { useEffect, useRef, useState } from "react";
import type { TimerView_Serialize, TipId } from "../../ipc/bindings";
import { commands } from "../../ipc/bindings";
import { useKeyboard } from "../settings/useKeyboard";
import type { StatusLine, TipInput } from "./statusLine";

const IGNORE = () => {};

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
 * up (Shown means rendered). `track` takes the line Today ended up with: the tip is reported once
 * per launch, when it is on screen. Got it hides the tip at once and is remembered for good.
 */
export function useTips(view: TimerView_Serialize | null) {
  const keyboard = useKeyboard(IGNORE).view;
  const [latched, setLatched] = useState<TipId | null>(null);
  const [dismissed, setDismissed] = useState<TipId | null>(null);
  const idle = view?.state === "idle";
  const due = view?.tip ?? null;
  if (due !== null && due !== latched) setLatched(due);
  if (view !== null && !idle) {
    if (latched !== null) setLatched(null);
    if (dismissed !== null) setDismissed(null);
  }
  const current = idle ? (due ?? latched) : null;
  const id = current !== null && current !== dismissed ? current : null;
  const keys = keyboard?.startPause.display
    ? { display: keyboard.startPause.display, spoken: keyboard.startPause.spoken ?? "" }
    : null;

  const onScreen = useRef<TipId | null>(null);
  const reported = useRef(new Set<TipId>());
  useEffect(() => {
    const showing = onScreen.current;
    if (showing === null || reported.current.has(showing)) return;
    reported.current.add(showing);
    report(showing, "shown");
  });

  return {
    tip: id === null ? null : tipInput(id, keys),
    welcome: view?.welcome === true,
    gotIt() {
      if (id === null) return;
      setDismissed(id);
      setLatched(null);
      report(id, "gotIt");
    },
    /** Today's line after ranking, and whether the window is showing it. */
    track(line: StatusLine | null, visible: boolean) {
      onScreen.current = visible && line?.tipId ? line.tipId : null;
    },
  };
}
