import { expect, test } from "vitest";
import type { TimerCommandErrorKind } from "../../ipc/bindings";
import { commandFailure, type StatusInput, statusLine } from "./statusLine";

const NONE: StatusInput = {
  startError: false,
  controlError: false,
  timerUnavailable: false,
  notice: null,
  store: "ok",
};

const ENDED = "Session ended.";
const RECOVERED = "Your last session ended while Orasenda was closed.";

test("status_line_nothing_to_say_is_null", () => {
  expect(statusLine(NONE)).toBeNull();
});

test("status_line_priority_start_error_over_milestone", () => {
  const line = statusLine({ ...NONE, startError: true, notice: ENDED, store: "unavailable" });
  expect(line).toEqual({
    text: "Focus didn't start. Orasenda's timer isn't responding.",
    tone: "attention",
    action: "tryAgain",
  });
});

test("status_line_control_error_has_no_action", () => {
  expect(statusLine({ ...NONE, controlError: true, notice: ENDED })).toEqual({
    text: "Orasenda's timer isn't responding.",
    tone: "attention",
  });
});

test("status_line_timer_unavailable_has_no_try_again", () => {
  expect(statusLine({ ...NONE, timerUnavailable: true })).toEqual({
    text: "Timer unavailable. Restart Orasenda to try again.",
    tone: "attention",
  });
});

test("status_line_milestone_is_neutral", () => {
  expect(statusLine({ ...NONE, notice: ENDED })).toEqual({ text: ENDED, tone: "neutral" });
});

test("status_line_store_alone_is_attention", () => {
  expect(statusLine({ ...NONE, store: "unavailable" })).toEqual({
    text: "Orasenda can't save sessions right now.",
    tone: "attention",
  });
  expect(statusLine({ ...NONE, store: "newer" })?.text).toBe(
    "This data was saved by a newer Orasenda.",
  );
});

test("status_line_joins_store_within_65", () => {
  const line = statusLine({ ...NONE, notice: ENDED, store: "unavailable" });
  expect(line).toEqual({
    text: "Session ended. Orasenda can't save sessions right now.",
    tone: "neutral",
  });
  expect(line?.text.length).toBeLessThanOrEqual(65);
});

test("status_line_joins_at_exactly_65_and_not_at_66", () => {
  const store = "Orasenda can't save sessions right now.";
  const exact = "x".repeat(65 - store.length - 1);
  expect(statusLine({ ...NONE, notice: exact, store: "unavailable" })?.text).toBe(
    `${exact} ${store}`,
  );
  const over = `${exact}x`;
  expect(statusLine({ ...NONE, notice: over, store: "unavailable" })?.text).toBe(store);
});

test("status_line_store_alone_when_joined_too_long", () => {
  // The milestone is rank 2 and the store line rank 3: the higher one shows alone.
  const line = statusLine({ ...NONE, notice: RECOVERED, store: "unavailable" });
  expect(line).toEqual({ text: RECOVERED, tone: "neutral" });
});

test("status_line_races_show_nothing", () => {
  const races: TimerCommandErrorKind[] = ["alreadyRunning", "nothingRunning", "wrongState"];
  for (const kind of races) expect(commandFailure({ kind, message: "" })).toBe("race");
  // A race sets no error flag, so nothing shows.
  expect(statusLine(NONE)).toBeNull();
});

test("status_line_invalid_spec_is_start_error", () => {
  // Impossible with `custom: null`; if it ever happens it is the generic start failure.
  expect(commandFailure({ kind: "invalidSpec", message: "out of range" })).toBe("failure");
  expect(commandFailure({ kind: "store", message: "disk" })).toBe("failure");
});
