import type { FullScreenFocus } from "@orasenda/ui";
import type { ComponentProps } from "react";
import type { TimerView_Serialize } from "../../ipc/bindings";

type SecondaryAction = NonNullable<
  ComponentProps<typeof FullScreenFocus>["secondaryActions"]
>[number];

/** The handlers the Focus window runs for its secondary actions; each is a Today command. */
export type CadenceHandlers = {
  extend(): void;
  takeBreak(): void;
  skipBreak(): void;
  keepGoing(): void;
  stopHere(): void;
};

/**
 * The Focus window's secondary actions for one view, the same rows Today's status line offers
 * (spec, "Shared with D"): "Keep going" and "Stop here" with the offer; "Skip break" in a break;
 * "Take a break" in an automatic step (the check-in); "+10 min" while it is on offer. The
 * component shows at most two and decides nothing itself.
 */
export function cadenceActions(
  view: TimerView_Serialize | null,
  handlers: CadenceHandlers,
  keepGoingPreset: string | null,
): SecondaryAction[] {
  if (!view) return [];
  if (view.state === "idle") {
    if (view.offer !== "keepGoing") return [];
    return [
      {
        id: "keepGoing",
        label: "Keep going",
        ...(keepGoingPreset ? { name: `Keep going with ${keepGoingPreset}` } : {}),
        onSelect: handlers.keepGoing,
      },
      { id: "stopHere", label: "Stop here", onSelect: handlers.stopHere },
    ];
  }
  if (view.phase === "break") {
    return [{ id: "skipBreak", label: "Skip break", onSelect: handlers.skipBreak }];
  }
  if (view.checkIn) {
    return [
      {
        id: "takeBreak",
        label: "Take a break",
        name: "Take a break now",
        onSelect: handlers.takeBreak,
      },
    ];
  }
  if (view.canExtend) {
    return [
      {
        id: "extend",
        label: "+10 min",
        name: "Add 10 minutes of focus",
        onSelect: handlers.extend,
      },
    ];
  }
  return [];
}
