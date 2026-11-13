import { resetSettingsQueueForTests } from "@shared/ipc/settingsQueue";
import { resetTimerQueueForTests } from "@shared/ipc/timerQueue";
import {
  argsOf,
  emitMilestone,
  emitTimer,
  IDLE,
  PAUSED,
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

function press(init: KeyboardEventInit) {
  const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
  window.dispatchEvent(event);
  return event;
}

test("pause_resume_and_end_call_their_commands", async () => {
  const { backend } = await renderToday();
  await emitTimer(RUNNING);
  fireEvent.click(screen.getByRole("button", { name: "Pause session" }));
  await emitTimer(PAUSED);
  fireEvent.click(screen.getByRole("button", { name: "Resume session" }));
  fireEvent.click(screen.getByRole("button", { name: "End session" }));
  await settle();

  expect(backend.calls.map((call) => call.cmd)).toEqual(
    expect.arrayContaining(["timer_pause", "timer_resume", "timer_stop"]),
  );
});

test("end_session_advertises_cmd_period", async () => {
  await renderToday();
  await emitTimer(RUNNING);

  expect(screen.getByRole("button", { name: "End session" })).toHaveAttribute(
    "aria-keyshortcuts",
    "Meta+Period",
  );
});

test("pause_resume_keeps_focus", async () => {
  await renderToday();
  await emitTimer(RUNNING);
  const pause = screen.getByRole("button", { name: "Pause session" });
  pause.focus();

  await emitTimer(PAUSED);
  const resume = screen.getByRole("button", { name: "Resume session" });
  expect(resume).toBe(pause);
  expect(resume).toHaveFocus();

  await emitTimer(RUNNING);
  expect(screen.getByRole("button", { name: "Pause session" })).toHaveFocus();
});

test("cmd_period_ends_running_and_paused", async () => {
  const { backend } = await renderToday();

  const idle = press({ key: ".", metaKey: true });
  await settle();
  expect(idle.defaultPrevented).toBe(false);
  expect(argsOf(backend.calls, "timer_stop")).toHaveLength(0);

  await emitTimer(RUNNING);
  const running = press({ key: ".", metaKey: true });
  await settle();
  expect(running.defaultPrevented).toBe(true);
  expect(argsOf(backend.calls, "timer_stop")).toHaveLength(1);

  await emitTimer(PAUSED);
  press({ key: ".", metaKey: true });
  await settle();
  expect(argsOf(backend.calls, "timer_stop")).toHaveLength(2);
});

test("end_moves_focus_to_start_after_line", async () => {
  await renderToday();
  await emitTimer(RUNNING);
  fireEvent.click(screen.getByRole("button", { name: "End session" }));
  await settle();

  // Rust publishes the view before the milestone: Start waits for the line.
  await emitTimer(IDLE);
  expect(screen.getByRole("button", { name: "Start focus" })).not.toHaveFocus();
  await emitMilestone({ kind: "ended", endReason: "stopped", sessionId: "s1" });

  expect(statusNodes()[0]).toHaveTextContent("Session ended.");
  expect(screen.getByRole("button", { name: "Start focus" })).toHaveFocus();
});

test("end_with_a_standing_store_line_waits_for_the_ended_line", async () => {
  await renderToday();
  await emitTimer({ ...RUNNING, store: "unavailable" });
  fireEvent.click(screen.getByRole("button", { name: "End session" }));
  await settle();

  await emitTimer({ ...IDLE, store: "unavailable" });
  expect(statusNodes()[0]).toBeDefined();
  expect(screen.getByRole("button", { name: "Start focus" })).not.toHaveFocus();
  await emitMilestone({ kind: "ended", endReason: "stopped", sessionId: "s1" });

  expect(screen.getByRole("button", { name: "Start focus" })).toHaveFocus();
});

test("start_advertises_no_keys_while_unavailable", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  await renderToday({ timer_state: () => Promise.reject({ kind: "store", message: "x" }) });
  expect(screen.getByRole("button", { name: "Start focus" })).not.toHaveAttribute(
    "aria-keyshortcuts",
  );
});

test("start_advertises_no_keys_while_starting", async () => {
  await renderToday({ timer_start: () => new Promise(() => {}) });
  fireEvent.click(screen.getByRole("button", { name: "Start focus" }));
  await settle();
  expect(screen.getByRole("button", { name: /Starting/ })).not.toHaveAttribute("aria-keyshortcuts");
});

test("natural_end_moves_focus_only_when_it_was_in_the_controls", async () => {
  await renderToday();
  await emitTimer(RUNNING);
  screen.getByRole("button", { name: "Pause session" }).focus();

  await emitTimer(IDLE);
  await emitMilestone({ kind: "ended", endReason: "completed", sessionId: "s1" });
  expect(screen.getByRole("button", { name: "Start focus" })).toHaveFocus();
});

test("natural_end_elsewhere_moves_no_focus", async () => {
  await renderToday();
  await emitTimer(RUNNING);
  screen.getByRole("heading", { level: 1 }).focus();

  await emitMilestone({ kind: "ended", endReason: "completed", sessionId: "s1" });
  await emitTimer(IDLE);

  expect(screen.getByRole("button", { name: "Start focus" })).not.toHaveFocus();
});

test("control_error_shows_line_without_action_and_success_clears_it", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  let answer: "fail" | "ok" = "fail";
  await renderToday({
    timer_pause: () =>
      answer === "fail" ? Promise.reject({ kind: "store", message: "x" }) : PAUSED,
  });
  await emitTimer(RUNNING);

  fireEvent.click(screen.getByRole("button", { name: "Pause session" }));
  await settle();
  expect(statusNodes()[0]).toHaveTextContent("Orasenda's timer isn't responding.");
  expect(screen.queryByRole("button", { name: /Try again/ })).toBeNull();

  answer = "ok";
  fireEvent.click(screen.getByRole("button", { name: "Pause session" }));
  await settle();
  expect(statusNodes()).toHaveLength(0);
});

test("control_races_are_logged_and_show_no_line", async () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  await renderToday({
    timer_stop: () => Promise.reject({ kind: "nothingRunning", message: "idle" }),
  });
  await emitTimer(RUNNING);

  fireEvent.click(screen.getByRole("button", { name: "End session" }));
  await settle();

  expect(statusNodes()).toHaveLength(0);
  expect(error).toHaveBeenCalled();
});
