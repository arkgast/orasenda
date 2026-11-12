import { expect, test } from "vitest";
import { type CadenceInput, statusLine } from "./statusLine";

const NONE = {
  startError: false,
  controlError: false,
  timerUnavailable: false,
  notice: null,
  store: "ok" as const,
  hint: true,
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
const HINT = "You can keep going automatically in Settings › Timer.";

test("status_hint_lowest_rank", () => {
  const shown = statusLine({ ...NONE, cadence: FOCUS });
  expect(shown?.text).toBe(HINT);
  expect(shown?.actions[0]).toMatchObject({
    id: "openSettings",
    label: "Open settings",
    name: "Open Timer settings",
    variant: "ghost",
  });
  expect(shown?.actions.map((action) => action.id)).toEqual(["openSettings"]);
  // Nothing else to say: the hint has the row to itself.
  expect(statusLine({ ...NONE, cadence: { ...FOCUS, state: "idle", mode: "idle" } })?.text).toBe(
    HINT,
  );
  // Off when it is not due.
  expect(statusLine({ ...NONE, hint: false, cadence: FOCUS })?.text).toBe("");
});

test("status_hint_outranked_by_warning", () => {
  const outranking = [
    statusLine({ ...NONE, startError: true, cadence: FOCUS }),
    statusLine({ ...NONE, controlError: true, cadence: FOCUS }),
    statusLine({ ...NONE, timerUnavailable: true, cadence: FOCUS }),
    statusLine({ ...NONE, cadence: { ...FOCUS, mode: "warning", canExtend: true } }),
    statusLine({ ...NONE, cadence: { ...FOCUS, checkIn: "Still going · ends 15:40" } }),
    statusLine({ ...NONE, cadence: { ...FOCUS, state: "idle", offer: "keepGoing" } }),
    statusLine({ ...NONE, notice: "Session ended.", cadence: { ...FOCUS, state: "idle" } }),
    statusLine({ ...NONE, store: "unavailable", cadence: FOCUS }),
    statusLine({ ...NONE, openFailed: true, cadence: FOCUS }),
  ];
  for (const row of outranking) expect(row?.text).not.toBe(HINT);
});
