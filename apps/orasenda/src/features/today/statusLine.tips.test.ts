import { expect, test } from "vitest";
import { type CadenceInput, statusLine } from "./statusLine";

const NONE = {
  startError: false,
  controlError: false,
  timerUnavailable: false,
  notice: null,
  store: "ok" as const,
};
const IDLE: CadenceInput = {
  state: "idle",
  phase: "focus",
  mode: "idle",
  canExtend: false,
  intent: null,
  suggestion: null,
  offer: null,
  checkIn: null,
  capLine: null,
};
const TIP = {
  id: "globalShortcut" as const,
  text: "Tip: ⌃⌥F starts.",
  spoken: "Tip: Control-Option-F starts.",
};

test("status_welcome_then_rest_line_then_tip", () => {
  const welcome = statusLine({ ...NONE, cadence: IDLE, welcome: true, tip: TIP });
  expect(welcome?.text).toBe("Welcome. Nothing to set up.");
  expect(welcome?.actions).toEqual([]);
  const rest = statusLine({
    ...NONE,
    cadence: { ...IDLE, capLine: "4 hours of focus today." },
    tip: TIP,
  });
  expect(rest?.text).toBe("4 hours of focus today.");
  const tip = statusLine({ ...NONE, cadence: IDLE, tip: TIP });
  expect(tip).toMatchObject({
    text: TIP.text,
    spoken: TIP.spoken,
    tipId: "globalShortcut",
    actions: [{ id: "gotIt", label: "Got it", variant: "ghost" }],
  });
});

test("status_tip_joins_only_session_ended", () => {
  const joined = statusLine({ ...NONE, cadence: IDLE, notice: "Session ended.", tip: TIP });
  expect(joined?.text).toBe(`Session ended. ${TIP.text}`);
  expect(joined?.spoken).toBe(`Session ended. ${TIP.spoken}`);
  expect(joined?.actions.map((a) => a.id)).toEqual(["gotIt"]);
  const other = statusLine({ ...NONE, cadence: IDLE, notice: "Break ended.", tip: TIP });
  expect(other?.text).toBe("Break ended.");
  expect(other?.tipId).toBeUndefined();
  const offer = statusLine({ ...NONE, cadence: { ...IDLE, offer: "keepGoing" }, tip: TIP });
  expect(offer?.text).toBe("Keep going?");
});

test("status_tip_waits_for_errors_and_the_store_line", () => {
  expect(statusLine({ ...NONE, startError: true, cadence: IDLE, tip: TIP })?.tipId).toBeUndefined();
  expect(
    statusLine({ ...NONE, store: "unavailable", cadence: IDLE, tip: TIP })?.tipId,
  ).toBeUndefined();
});
