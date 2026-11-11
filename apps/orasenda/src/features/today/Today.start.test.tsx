import { clearMocks } from "@tauri-apps/api/mocks";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { resetSettingsQueueForTests } from "../../ipc/settingsQueue";
import { resetTimerQueueForTests } from "../../ipc/timerQueue";
import {
  argsOf,
  deferred,
  emitClock,
  emitTimer,
  PAUSED,
  RUNNING,
  settle,
} from "../../test/fixtures";
import { renderToday, savedSettings, statusNodes } from "./Today.support";

beforeEach(() => {
  resetTimerQueueForTests();
  resetSettingsQueueForTests();
});

afterEach(async () => {
  // Unmount (and unlisten) while the IPC mock is still installed.
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

test("start_focus_calls_timer_start_with_saved_preset", async () => {
  const { backend } = await renderToday(savedSettings({ preset: "fifty_ten" }));

  fireEvent.click(screen.getByRole("button", { name: "Start focus" }));
  await settle();

  expect(argsOf(backend.calls, "timer_start")).toEqual([
    { request: { preset: "fifty_ten", custom: null } },
  ]);
});

test("start_sends_custom_null", async () => {
  // Even with Custom saved: Rust uses the saved spec when `custom` is null.
  const { backend } = await renderToday(savedSettings({ preset: "custom" }));

  fireEvent.click(screen.getByRole("button", { name: "Start focus" }));
  await settle();

  expect(argsOf(backend.calls, "timer_start")).toEqual([
    { request: { preset: "custom", custom: null } },
  ]);
});

test("start_before_settings_load_uses_classic", async () => {
  const { backend } = await renderToday({ settings_get: () => new Promise(() => {}) });

  fireEvent.click(screen.getByRole("button", { name: "Start focus" }));
  await settle();

  expect(argsOf(backend.calls, "timer_start")).toEqual([
    { request: { preset: "classic", custom: null } },
  ]);
});

test("just_two_minutes_calls_timer_start_with_quick", async () => {
  const { backend } = await renderToday(savedSettings({ preset: "custom" }));

  fireEvent.click(screen.getByRole("button", { name: "Just 2 minutes" }));
  await settle();

  expect(argsOf(backend.calls, "timer_start")).toEqual([
    { request: { preset: "quick", custom: null } },
  ]);
});

test("today_has_no_radios_fields_or_dev_panel", async () => {
  await renderToday(savedSettings({ preset: "custom" }));

  expect(screen.queryByRole("radio")).toBeNull();
  expect(screen.queryByRole("spinbutton")).toBeNull();
  expect(screen.queryByText(/Developer|spike/i)).toBeNull();
});

test("start_has_no_finish_time_line_and_advertises_cmd_enter", async () => {
  const { container } = await renderToday();
  await emitClock({ epochMs: 1, clock: "14:32", idleFinish: "14:57" });

  expect(container).not.toHaveTextContent("Realistic finish");
  const start = screen.getByRole("button", { name: "Start focus" });
  expect(start).toHaveAttribute("aria-keyshortcuts", "Meta+Enter");
});

test("cmd_enter_starts_only_idle", async () => {
  const { backend } = await renderToday(savedSettings({ preset: "deep_block" }));

  const event = press({ key: "Enter", metaKey: true });
  await settle();

  expect(event.defaultPrevented).toBe(true);
  expect(argsOf(backend.calls, "timer_start")).toEqual([
    { request: { preset: "deep_block", custom: null } },
  ]);

  await emitTimer(RUNNING);
  const again = press({ key: "Enter", metaKey: true });
  await settle();
  expect(again.defaultPrevented).toBe(false);
  expect(argsOf(backend.calls, "timer_start")).toHaveLength(1);

  await emitTimer(PAUSED);
  press({ key: "Enter", metaKey: true });
  await settle();
  expect(argsOf(backend.calls, "timer_start")).toHaveLength(1);
});

test("cmd_enter_does_nothing_while_starting", async () => {
  const pending = deferred<unknown>();
  const { backend } = await renderToday({ timer_start: () => pending.promise });

  press({ key: "Enter", metaKey: true });
  await settle();
  press({ key: "Enter", metaKey: true });
  press({ key: "Enter", metaKey: true, shiftKey: true });
  await settle();

  expect(argsOf(backend.calls, "timer_start")).toHaveLength(1);
  expect(screen.getByRole("button", { name: "Starting…" })).toBeInTheDocument();
  pending.resolve(RUNNING);
});

test("cmd_shift_enter_quick", async () => {
  const { backend } = await renderToday();

  const event = press({ key: "Enter", metaKey: true, shiftKey: true });
  await settle();

  expect(event.defaultPrevented).toBe(true);
  expect(argsOf(backend.calls, "timer_start")).toEqual([
    { request: { preset: "quick", custom: null } },
  ]);
});

test("start_moves_focus_to_pause_session", async () => {
  await renderToday();

  fireEvent.click(screen.getByRole("button", { name: "Start focus" }));
  await settle();
  await emitTimer(RUNNING);

  expect(screen.getByRole("button", { name: "Pause session" })).toHaveFocus();
});

test("a_start_from_another_surface_moves_no_focus", async () => {
  await renderToday();
  const start = screen.getByRole("button", { name: "Start focus" });
  start.focus();

  await emitTimer(RUNNING);

  expect(screen.getByRole("button", { name: "Pause session" })).not.toHaveFocus();
});

test("start_error_shows_line_and_try_again_repeats_the_request", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  let answer: "fail" | "ok" = "fail";
  const { backend } = await renderToday({
    ...savedSettings({ preset: "fifty_ten" }),
    timer_start: () =>
      answer === "fail" ? Promise.reject({ kind: "store", message: "x" }) : RUNNING,
  });

  fireEvent.click(screen.getByRole("button", { name: "Just 2 minutes" }));
  await settle();

  expect(statusNodes()).toHaveLength(1);
  expect(statusNodes()[0]).toHaveTextContent(
    "Focus didn't start. Orasenda's timer isn't responding.",
  );

  answer = "ok";
  fireEvent.click(screen.getByRole("button", { name: "Try again starting focus" }));
  await settle();

  expect(argsOf(backend.calls, "timer_start")).toEqual([
    { request: { preset: "quick", custom: null } },
    { request: { preset: "quick", custom: null } },
  ]);
  // A successful start clears the line.
  expect(statusNodes()).toHaveLength(0);
});

test("try_again_repeats_start", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const { backend } = await renderToday({
    ...savedSettings({ preset: "deep_block" }),
    timer_start: () => Promise.reject({ kind: "invalidSpec", message: "out of range" }),
  });

  fireEvent.click(screen.getByRole("button", { name: "Start focus" }));
  await settle();
  fireEvent.click(screen.getByRole("button", { name: "Try again starting focus" }));
  await settle();

  expect(argsOf(backend.calls, "timer_start")).toEqual([
    { request: { preset: "deep_block", custom: null } },
    { request: { preset: "deep_block", custom: null } },
  ]);
});

test("start_race_is_logged_and_shows_no_line", async () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  await renderToday({
    timer_start: () => Promise.reject({ kind: "alreadyRunning", message: "running" }),
  });

  fireEvent.click(screen.getByRole("button", { name: "Start focus" }));
  await settle();

  expect(statusNodes()).toHaveLength(0);
  expect(error).toHaveBeenCalled();
});

// Rendering the clock and the view

test("clock_tick_renders_wall_clock_in_the_ring", async () => {
  await renderToday();

  await emitClock({ epochMs: 1, clock: "14:32", idleFinish: "14:57" });

  expect(screen.getByRole("heading", { level: 1, name: "Today" })).toBeInTheDocument();
  expect(screen.getByRole("timer", { name: "No session" })).toHaveTextContent("Clock · 14:32");
  expect(screen.getByRole("button", { name: "Start focus" })).toBeInTheDocument();
});

test("timer_tick_renders_digits_and_the_round_pause_button", async () => {
  await renderToday();

  await emitClock({ epochMs: 1, clock: "14:55", idleFinish: null });
  await emitTimer(RUNNING);

  expect(
    screen.getByRole("timer", {
      name: "Focus, 24 minutes 59 seconds remaining, Wall clock, 14:55",
    }),
  ).toHaveTextContent("24:59");
  expect(screen.getByRole("button", { name: "Pause session" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "End session" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Start focus" })).toBeNull();
});

test("paused_view_renders_resume_session", async () => {
  await renderToday();

  await emitTimer(PAUSED);

  expect(screen.getByRole("timer", { name: /^Paused, 24 minutes 59 seconds remaining/ }));
  expect(screen.getByRole("button", { name: "Resume session" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Pause session" })).toBeNull();
});
