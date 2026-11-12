import { expect, test } from "vitest";
import {
  type CadenceInput,
  type StatusAction,
  type StatusInput,
  statusLine,
} from "./statusLine";

const NONE: StatusInput = {
  startError: false,
  controlError: false,
  timerUnavailable: false,
  notice: null,
  store: "ok",
};

const FOCUS: CadenceInput = {
  state: "running",
  phase: "focus",
  mode: "focus",
  canExtend: false,
  intent: null,
  suggestion: null,
  offer: null,
  checkIn: null,
  capLine: null,
};
const WARNING: CadenceInput = { ...FOCUS, mode: "warning", canExtend: true };
const BREAK: CadenceInput = {
  ...FOCUS,
  phase: "break",
  mode: "break",
  suggestion: { text: "Look at something far away.", label: "optional" },
};
const IDLE: CadenceInput = { ...FOCUS, state: "idle", mode: "idle" };

const line = (cadence: CadenceInput, over: Partial<StatusInput> = {}) =>
  statusLine({ ...NONE, cadence, ...over });

const ids = (actions: StatusAction[] | undefined) => actions?.map((action) => action.id);

test("status_line_rank_for_every_row", () => {
  // Rank 1: the answer to the last action beats everything below.
  expect(line(WARNING, { controlError: true })?.text).toBe("Orasenda's timer isn't responding.");

  // Rank 2, in the table's order.
  expect(line(WARNING, { notice: "x", store: "newer" })).toEqual({
    text: "Two minutes left. Finish the thought.",
    tone: "warning",
    actions: [
      { id: "extend", label: "+10 min", name: "Add 10 minutes of focus", variant: "quiet" },
    ],
  });
  expect(line({ ...WARNING, checkIn: "Still going · ends 15:40" })).toEqual({
    text: "Two minutes left. Finish the thought.",
    tone: "warning",
    actions: [{ id: "takeBreak", label: "Take a break", name: "Take a break now", variant: "quiet" }],
  });
  // The cap notice rides on the break's actions.
  const cap = "You've focused 4 hours today. A good place to stop.";
  expect(line({ ...BREAK, canExtend: true }, { notice: cap })).toEqual({
    text: cap,
    tone: "neutral",
    actions: [
      {
        id: "extend",
        label: "+10 min",
        name: "Back to focus for 10 more minutes",
        variant: "quiet",
      },
      { id: "skipBreak", label: "Skip break", variant: "ghost" },
    ],
  });
  expect(line({ ...BREAK, canExtend: true })?.text).toBe("Optional: look at something far away.");
  expect(line({ ...IDLE, offer: "keepGoing" }, { notice: "Session ended." })).toEqual({
    text: "Keep going?",
    tone: "neutral",
    actions: [
      { id: "keepGoing", label: "Keep going", variant: "quiet" },
      { id: "stopHere", label: "Stop here", variant: "ghost" },
    ],
  });
  expect(line({ ...FOCUS, checkIn: "Still going · ends 15:40" }, { store: "newer" })).toEqual({
    text: "Still going · ends 15:40",
    tone: "neutral",
    actions: [{ id: "takeBreak", label: "Take a break", name: "Take a break now", variant: "quiet" }],
  });
  expect(line(IDLE, { notice: "Break over. Start when you're ready." })).toEqual({
    text: "Break over. Start when you're ready.",
    tone: "neutral",
    actions: [],
  });

  // Rank 3: the store line, ahead of the intent button and the rest line.
  expect(line(FOCUS, { store: "unavailable" })?.tone).toBe("attention");
  expect(line({ ...IDLE, capLine: "4 hours of focus today." }, { store: "newer" })?.tone).toBe(
    "attention",
  );

  // Rank 4: a running or paused focus with nothing above.
  expect(line(FOCUS)).toEqual({
    text: "",
    tone: "neutral",
    actions: [{ id: "intent", label: "What will be done?", variant: "quiet" }],
  });
  expect(line({ ...FOCUS, state: "paused", mode: "paused", intent: "Draft" })?.actions).toEqual([
    { id: "intent", label: "Edit intent", variant: "quiet" },
  ]);
  // Rank 5: idle, the quiet line.
  expect(line({ ...IDLE, capLine: "4 hours of focus today." })).toEqual({
    text: "4 hours of focus today.",
    tone: "rest",
    actions: [],
  });
  expect(line(IDLE)).toBeNull();
});

test("status_line_keep_going_names_the_preset", () => {
  const offer = { ...IDLE, offer: "keepGoing" as const };
  expect(line(offer, { keepGoingPreset: "Steady Focus" })?.actions[0]).toEqual({
    id: "keepGoing",
    label: "Keep going",
    name: "Keep going with Steady Focus",
    variant: "quiet",
  });
});

test("status_line_break_labels_and_no_extend_at_the_cap", () => {
  const experimental = { text: "Sit quietly and let your mind wander.", label: "experimental" as const };
  expect(line({ ...BREAK, suggestion: experimental })?.text).toBe(
    "Experimental: sit quietly and let your mind wander.",
  );
  const plain = { text: "Walk to another room.", label: null };
  const row = line({ ...BREAK, suggestion: plain });
  expect(row?.text).toBe("Walk to another room.");
  expect(ids(row?.actions)).toEqual(["skipBreak"]);
  // A paused break keeps its row.
  expect(line({ ...BREAK, state: "paused", mode: "paused" })?.actions.at(-1)?.id).toBe("skipBreak");
});

test("status_line_stacked_break_drops_the_suggestion", () => {
  const row = line({ ...BREAK, canExtend: true }, { stacked: true });
  expect(row?.text).toBe("");
  expect(ids(row?.actions)).toEqual(["extend", "skipBreak"]);
});

test("status_line_warning_is_for_focus_only", () => {
  const breakWarning = { ...BREAK, mode: "warning" as const, canExtend: true };
  expect(line(breakWarning)?.text).toBe("Optional: look at something far away.");
  // At the cap the focus warning has no action.
  expect(line({ ...WARNING, canExtend: false })?.actions).toEqual([]);
});

test("status_line_joins_a_notice_and_the_store_only_without_actions", () => {
  const row = line(IDLE, { notice: "Break ended.", store: "unavailable" });
  expect(row?.text).toBe("Break ended. Orasenda can't save sessions right now.");
});
