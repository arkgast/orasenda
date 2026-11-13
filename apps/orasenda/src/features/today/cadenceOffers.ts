import type { Mode, Offer, Phase } from "@shared/ipc/bindings";

/** The view fields the cadence rule reads; Today's `CadenceInput` and the timer view both fit. */
export type OfferInput = {
  state: "idle" | "running" | "paused";
  phase: Phase;
  mode: Mode;
  /** "+10 min" is on offer now. */
  canExtend: boolean;
  offer: Offer | null;
  checkIn: string | null;
};

export type OfferId = "extend" | "takeBreak" | "skipBreak";

export type CadenceOffer = {
  id: OfferId;
  label: string;
  /** The accessible name when it says more than the label. */
  name?: string;
  variant: "quiet" | "ghost";
};

const TAKE_BREAK: CadenceOffer = {
  id: "takeBreak",
  label: "Take a break",
  name: "Take a break now",
  variant: "quiet",
};
const SKIP_BREAK: CadenceOffer = { id: "skipBreak", label: "Skip break", variant: "ghost" };
const EXTEND_FOCUS: CadenceOffer = {
  id: "extend",
  label: "+10 min",
  name: "Add 10 minutes of focus",
  variant: "quiet",
};
const EXTEND_BREAK: CadenceOffer = {
  id: "extend",
  label: "+10 min",
  name: "Back to focus for 10 more minutes",
  variant: "quiet",
};

/**
 * The cadence actions both surfaces offer (Today's status row and the Focus window), so they cannot
 * drift. `null`: no cadence row applies. An empty list: the row applies and has no action (the
 * warning without "+10 min").
 *
 * - Break: "+10 min" while it is on offer, then "Skip break".
 * - Warning in focus: "Take a break" when a check-in is due, else "+10 min" while it is on offer.
 * - Plain focus: "Take a break" from a check-in; never "+10 min" before the two-minute warning.
 *
 * The keep-going offer is not here: its row text and actions belong to each surface.
 */
export function cadenceOffers(input: OfferInput): CadenceOffer[] | null {
  const { state, phase } = input;
  if (state !== "idle" && phase === "break") {
    return input.canExtend ? [EXTEND_BREAK, SKIP_BREAK] : [SKIP_BREAK];
  }
  if (input.mode === "warning" && phase === "focus") {
    if (input.checkIn) return [TAKE_BREAK];
    return input.canExtend ? [EXTEND_FOCUS] : [];
  }
  if (input.offer === "keepGoing") return null;
  if (input.checkIn && state === "running" && phase === "focus") return [TAKE_BREAK];
  return null;
}
