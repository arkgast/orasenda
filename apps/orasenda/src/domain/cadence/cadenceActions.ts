import type { FullScreenFocus } from "@orasenda/ui";
import type { TimerView_Serialize } from "@shared/ipc/bindings";
import type { ComponentProps } from "react";
import { cadenceOffers } from "./cadenceOffers";

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
 * (spec, "Shared with D"): "Keep going" and "Stop here" with the offer;
 * the break, warning and check-in actions come from `cadenceOffers`, the rule Today shares ("+10 min"
 * only from the two-minute warning, and in a break before "Skip break"). The component shows at
 * most two and decides nothing itself.
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
  const offers = cadenceOffers(view) ?? [];
  return offers.map(({ id, label, name }) => ({
    id,
    label,
    ...(name ? { name } : {}),
    onSelect: handlers[id],
  }));
}
