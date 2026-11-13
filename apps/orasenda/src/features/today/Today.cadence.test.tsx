import { resetSettingsQueueForTests } from "@shared/ipc/settingsQueue";
import { resetTimerQueueForTests } from "@shared/ipc/timerQueue";
import {
  argsOf,
  BREAK,
  emitMilestone,
  emitTimer,
  IDLE,
  RUNNING,
  settle,
} from "@shared/test/fixtures";
import { clearMocks } from "@tauri-apps/api/mocks";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { renderToday, statusNodes } from "./Today.support";

beforeEach(() => {
  resetTimerQueueForTests();
  resetSettingsQueueForTests();
});

afterEach(async () => {
  cleanup();
  await settle();
  clearMocks();
  vi.restoreAllMocks();
});

const WARNING = { ...RUNNING, mode: "warning" as const, canExtend: true };
const AUTO = { ...RUNNING, checkIn: "Still going · ends 15:40" };

test("auto_step_warning_offers_take_break_not_extend", async () => {
  const { backend } = await renderToday();
  await emitTimer({ ...WARNING, checkIn: AUTO.checkIn, canExtend: false });

  expect(statusNodes()[0]).toHaveTextContent("Two minutes left. Finish the thought.");
  expect(screen.queryByRole("button", { name: /Add 10 minutes/ })).toBeNull();
  const takeBreak = screen.getByRole("button", { name: "Take a break now" });
  takeBreak.focus();
  fireEvent.click(takeBreak);
  await settle();
  expect(argsOf(backend.calls, "timer_take_break")).toHaveLength(1);
});

test("warning_row_extends_and_the_auto_step_row_takes_a_break", async () => {
  const { backend } = await renderToday();
  await emitTimer(WARNING);
  fireEvent.click(screen.getByRole("button", { name: "Add 10 minutes of focus" }));
  await settle();
  expect(argsOf(backend.calls, "timer_extend")).toHaveLength(1);

  await emitTimer(AUTO);
  expect(statusNodes()[0]).toHaveTextContent("Still going · ends 15:40");
  expect(screen.getByRole("button", { name: "Take a break now" })).toHaveTextContent(
    "Take a break",
  );
});

test("keep_going_offer_starts_the_saved_preset_and_stop_here_dismisses", async () => {
  const { backend } = await renderToday();
  await emitTimer({ ...IDLE, offer: "keepGoing" });

  expect(statusNodes()[0]).toHaveTextContent("Keep going?");
  fireEvent.click(screen.getByRole("button", { name: "Keep going with Steady Focus" }));
  await settle();
  expect(argsOf(backend.calls, "timer_start")).toEqual([{ request: { quick: false } }]);

  fireEvent.click(screen.getByRole("button", { name: "Stop here" }));
  await settle();
  expect(argsOf(backend.calls, "timer_dismiss_offer")).toHaveLength(1);
});

test("controls_in_break_skip_and_pause_break", async () => {
  const { backend } = await renderToday();
  await emitTimer(RUNNING);
  screen.getByRole("button", { name: "Pause session" }).focus();

  await emitTimer(BREAK);
  const pause = screen.getByRole("button", { name: "Pause break" });
  expect(pause).toHaveFocus();
  expect(statusNodes()[0]).toHaveTextContent("Optional: look at something far away.");

  const skips = screen.getAllByRole("button", { name: "Skip break" });
  expect(skips).toHaveLength(2);
  expect(skips[1]).toHaveAttribute("aria-keyshortcuts", "Meta+Period");
  expect(screen.queryByRole("button", { name: "End session" })).toBeNull();

  fireEvent.click(pause);
  await emitTimer({ ...BREAK, state: "paused", mode: "paused" });
  expect(screen.getByRole("button", { name: "Resume break" })).toBeInTheDocument();

  fireEvent.click(skips[1]);
  window.dispatchEvent(
    new KeyboardEvent("keydown", { key: ".", metaKey: true, bubbles: true, cancelable: true }),
  );
  await settle();
  expect(argsOf(backend.calls, "timer_stop")).toHaveLength(2);
});

test("break_extend_action_goes_back_to_focus", async () => {
  const { backend } = await renderToday();
  await emitTimer({ ...BREAK, canExtend: true });
  fireEvent.click(screen.getByRole("button", { name: "Back to focus for 10 more minutes" }));
  await settle();
  expect(argsOf(backend.calls, "timer_extend")).toHaveLength(1);
});

test("summary_break_heading", async () => {
  await renderToday();
  await emitTimer(BREAK);
  const summary = document.querySelector('[data-slot="preset-summary-full"]');
  expect(summary).toHaveTextContent("Steady Focus · break · ends 14:30");

  await emitTimer({ ...BREAK, breakKind: "long" });
  expect(document.querySelector('[data-slot="preset-summary-full"]')).toHaveTextContent(
    "Steady Focus · long break · ends 14:30",
  );
});

test("break_notices_by_how_the_break_ended", async () => {
  await renderToday();
  await emitMilestone({ kind: "ended", endReason: "completed", sessionId: "b1", phase: "break" });
  expect(statusNodes()[0]).toHaveTextContent("Break over. Start when you're ready.");

  await emitMilestone({ kind: "ended", endReason: "stopped", sessionId: "b2", phase: "break" });
  expect(statusNodes()[0]).toHaveTextContent("Break ended.");
});

test("cap_notice_survives_the_break_start_and_names_the_hours", async () => {
  await renderToday();
  await emitMilestone({ kind: "capReached", sessionId: "s1", phase: "focus" });
  await emitMilestone({ kind: "breakStarted", sessionId: "s1", phase: "break" });
  await emitTimer({ ...BREAK, sessionId: "b1" });

  expect(statusNodes()[0]).toHaveTextContent("You've focused 4 hours today. A good place to stop.");
  expect(screen.getAllByRole("button", { name: "Skip break" })).toHaveLength(2);
});

test("rest_line_shows_the_cap_line_while_idle", async () => {
  await renderToday();
  await emitTimer({ ...IDLE, capLine: "4 hours of focus today." });
  expect(statusNodes()[0]).toHaveTextContent("4 hours of focus today.");
});

test("start_runs_with_no_step", async () => {
  const { backend } = await renderToday();
  fireEvent.click(screen.getByRole("button", { name: /Start focus/ }));
  await settle();
  expect(argsOf(backend.calls, "timer_start")).toEqual([{ request: { quick: false } }]);
  await emitTimer(RUNNING);
  expect(screen.queryByRole("textbox")).toBeNull();
  expect(statusNodes()).toHaveLength(0);
  expect(screen.getByRole("button", { name: /Pause session/ })).toBeInTheDocument();
});

test("extend_refused_at_the_cap_is_a_race_and_shows_nothing", async () => {
  await renderToday({
    timer_extend: () => Promise.reject({ kind: "extensionCap", message: "cap" }),
  });
  await emitTimer(WARNING);
  vi.spyOn(console, "error").mockImplementation(() => {});
  fireEvent.click(screen.getByRole("button", { name: "Add 10 minutes of focus" }));
  await settle();
  expect(statusNodes()[0]).toHaveTextContent("Two minutes left. Finish the thought.");
  expect(screen.queryByText("Orasenda's timer isn't responding.")).toBeNull();
});

test("status_actions_keep_focus_off_the_body", async () => {
  await renderToday();
  await emitTimer(WARNING);
  fireEvent.click(screen.getByRole("button", { name: "Add 10 minutes of focus" }));
  await emitTimer({ ...RUNNING, extensions: 1 });
  expect(document.body).not.toHaveFocus();
  expect(screen.getByRole("button", { name: "Pause session" })).toHaveFocus();

  await emitTimer(AUTO);
  const takeBreak = screen.getByRole("button", { name: "Take a break now" });
  takeBreak.focus();
  fireEvent.click(takeBreak);
  await emitTimer(BREAK);
  expect(document.body).not.toHaveFocus();

  await emitTimer({ ...IDLE, offer: "keepGoing" });
  fireEvent.click(screen.getByRole("button", { name: "Stop here" }));
  await settle();
  expect(document.body).not.toHaveFocus();
});
