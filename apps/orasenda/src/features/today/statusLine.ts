import type {
  Mode,
  Offer,
  Phase,
  StoreStatus,
  SuggestionView_Serialize,
  TimerCommandError,
} from "../../ipc/bindings";

/** What the cadence part of the timer view says (E: warning, break, offer, auto step, rest line). */
export type CadenceInput = {
  state: "idle" | "running" | "paused";
  phase: Phase;
  mode: Mode;
  /** "+10 min" is on offer now. */
  canExtend: boolean;
  intent: string | null;
  suggestion: SuggestionView_Serialize | null;
  offer: Offer | null;
  /** "Still going · ends 15:40", while running in an automatic step. */
  checkIn: string | null;
  capLine: string | null;
};

export type StatusInput = {
  /** `timer_start` answered an error that is not a race. */
  startError: boolean;
  /** `timer_pause`, `timer_resume` or `timer_stop` answered an error that is not a race. */
  controlError: boolean;
  /** `focus_view_open` failed and nothing newer has happened. */
  openFailed?: boolean;
  /** `timer_state` failed: no view will come this launch. */
  timerUnavailable: boolean;
  /** The one-shot milestone line ("Session ended."), or `null`. */
  notice: string | null;
  store: StoreStatus;
  /** The cadence fields of the view; `null` before the first view. */
  cadence?: CadenceInput | null;
  /** The stacked strip: its break row leaves the suggestion out. */
  stacked?: boolean;
  /** `notice` is the deep-hours line, which outranks the keep-going offer. */
  capNotice?: boolean;
  /** The selected preset's name, for the keep-going action's accessible name. */
  keepGoingPreset?: string | null;
  /** The keep-going hint is due (lowest rank: it waits while any other line shows). */
  hint?: boolean;
};

export type StatusActionId =
  | "tryAgain"
  | "tryAgainOpen"
  | "extend"
  | "takeBreak"
  | "skipBreak"
  | "keepGoing"
  | "stopHere"
  | "openSettings"
  | "intent";

export type StatusAction = {
  id: StatusActionId;
  label: string;
  /** The accessible name when it differs from the label; it always contains the label. */
  name?: string;
  variant: "quiet" | "ghost";
};

export type StatusLine = {
  text: string;
  tone: "neutral" | "attention" | "warning" | "rest";
  /** At most two: the first is the notice's own action, the second a sibling button. */
  actions: StatusAction[];
};

/** A rank 2 line and the store line share a row only up to this many characters (InlineNotice README). */
const JOIN_LIMIT = 65;

const STORE_LINES: Readonly<Record<Exclude<StoreStatus, "ok">, string>> = {
  unavailable: "Orasenda can't save sessions right now.",
  newer: "This data was saved by a newer Orasenda.",
};

/**
 * Races between surfaces (ADR-013): another surface got there first, so the next view is the truth
 * and nothing is shown. Any other error, `invalidSpec` included, is a failure.
 */
export function commandFailure(error: TimerCommandError): "race" | "failure" {
  switch (error.kind) {
    case "alreadyRunning":
    case "nothingRunning":
    case "wrongState":
    case "extensionCap":
      return "race";
    default:
      return "failure";
  }
}

const TRY_AGAIN: StatusAction = {
  id: "tryAgain",
  label: "Try again",
  name: "Try again starting focus",
  variant: "quiet",
};
const TRY_AGAIN_OPEN: StatusAction = {
  id: "tryAgainOpen",
  label: "Try again",
  name: "Try again opening the focus view",
  variant: "ghost",
};
const TAKE_BREAK: StatusAction = {
  id: "takeBreak",
  label: "Take a break",
  name: "Take a break now",
  variant: "quiet",
};
const OPEN_SETTINGS: StatusAction = {
  id: "openSettings",
  label: "Open settings",
  name: "Open Timer settings",
  variant: "ghost",
};
const HINT_TEXT = "You can keep going automatically in Settings › Timer.";
const SKIP_BREAK: StatusAction = { id: "skipBreak", label: "Skip break", variant: "ghost" };

const line = (
  text: string,
  tone: StatusLine["tone"],
  actions: StatusAction[] = [],
): StatusLine => ({ text, tone, actions });

/** The suggestion with its label as the first word: "Optional: look at something far away." */
function suggestionText(suggestion: SuggestionView_Serialize): string {
  const { text, label } = suggestion;
  if (!label) return text;
  const word = label === "optional" ? "Optional" : "Experimental";
  return `${word}: ${text.charAt(0).toLowerCase()}${text.slice(1)}`;
}

function breakRow(cadence: CadenceInput, input: StatusInput): StatusLine {
  const extend: StatusAction[] = cadence.canExtend
    ? [
        {
          id: "extend",
          label: "+10 min",
          name: "Back to focus for 10 more minutes",
          variant: "quiet",
        },
      ]
    : [];
  // A notice (the deep-hours line) replaces the suggestion; the stacked strip has room for neither (the cap note does not fit 360x240).
  const text = input.stacked
    ? ""
    : (input.notice ?? (cadence.suggestion ? suggestionText(cadence.suggestion) : ""));
  return line(text, "neutral", [...extend, SKIP_BREAK]);
}

/** Rank 2 rows that come from the view. */
function viewRow(cadence: CadenceInput, input: StatusInput): StatusLine | null {
  const { state, phase } = cadence;
  if (state !== "idle" && phase === "break") return breakRow(cadence, input);
  if (cadence.mode === "warning" && phase === "focus") {
    const actions: StatusAction[] = cadence.checkIn
      ? [TAKE_BREAK]
      : cadence.canExtend
        ? [{ id: "extend", label: "+10 min", name: "Add 10 minutes of focus", variant: "quiet" }]
        : [];
    return line("Two minutes left. Finish the thought.", "warning", actions);
  }
  if (cadence.offer === "keepGoing") {
    const name = input.keepGoingPreset ? `Keep going with ${input.keepGoingPreset}` : undefined;
    const text = input.capNotice && input.notice ? input.notice : "Keep going?";
    return line(text, "neutral", [
      { id: "keepGoing", label: "Keep going", name, variant: "quiet" },
      { id: "stopHere", label: "Stop here", variant: "ghost" },
    ]);
  }
  if (cadence.checkIn && state === "running" && phase === "focus") {
    return line(cadence.checkIn, "neutral", [TAKE_BREAK]);
  }
  return null;
}

/**
 * The one line Today's status row shows, by priority: the answer to the last action (rank 1);
 * the cadence rows and one-shot milestones (rank 2, in the spec's table order); the standing store
 * line (rank 3); the intent button (rank 4) and the quiet rest line (rank 5). A milestone and the
 * store line join in one row when together they fit `JOIN_LIMIT`; a joined row takes the first
 * sentence's tone. Otherwise the higher line shows alone.
 */
export function statusLine(input: StatusInput): StatusLine | null {
  if (input.startError) {
    return line("Focus didn't start. Orasenda's timer isn't responding.", "attention", [TRY_AGAIN]);
  }
  if (input.controlError) return line("Orasenda's timer isn't responding.", "attention");
  if (input.timerUnavailable) {
    return line("Timer unavailable. Restart Orasenda to try again.", "attention");
  }
  const cadence = input.cadence ?? null;
  const fromView = cadence ? viewRow(cadence, input) : null;
  if (fromView) return fromView;
  // Newest wins among the one-shot lines: a failed open is cleared by the next transition.
  if (input.openFailed) {
    return line("The focus view didn't open.", "attention", [TRY_AGAIN_OPEN]);
  }
  const store = input.store === "ok" ? null : STORE_LINES[input.store];
  if (input.notice) {
    const joined = store ? `${input.notice} ${store}` : null;
    return line(joined && joined.length <= JOIN_LIMIT ? joined : input.notice, "neutral");
  }
  if (store) return line(store, "attention");
  const intent: StatusAction | null =
    cadence && cadence.state !== "idle" && cadence.phase === "focus"
      ? {
          id: "intent",
          label: cadence.intent ? "Edit intent" : "What will be done?",
          variant: "quiet",
        }
      : null;
  // Below every other line. One action only: with the intent button beside it the text takes
  // three lines at the narrow sizes. The intent field stays one shortcut away (intentEvents).
  if (input.hint) return line(HINT_TEXT, "neutral", [OPEN_SETTINGS]);
  if (intent) return line("", "neutral", [intent]);
  return cadence?.capLine ? line(cadence.capLine, "rest") : null;
}
