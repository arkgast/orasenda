import { clearMocks } from "@tauri-apps/api/mocks";
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
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
import {
  INVALID_SPEC,
  outsideRing,
  RANGE_HELP,
  renderToday,
  savedSettings,
  statusNodes,
} from "./Today.support";

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

// Starting

test("start_focus_calls_timer_start_with_checked_preset", async () => {
  const { backend } = await renderToday(savedSettings({ preset: "fifty_ten" }));
  expect(screen.getByRole("radio", { name: "50/10" })).toBeChecked();

  fireEvent.click(screen.getByRole("button", { name: "Start focus" }));
  await settle();

  expect(argsOf(backend.calls, "timer_start")).toEqual([
    { request: { preset: "fifty_ten", custom: null } },
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

test("custom_start_sends_the_current_draft", async () => {
  const { backend } = await renderToday(savedSettings({ preset: "custom" }));

  fireEvent.click(screen.getByRole("button", { name: "Start focus" }));
  await settle();

  expect(argsOf(backend.calls, "timer_start")).toEqual([
    { request: { preset: "custom", custom: { focusMin: 45, breakMin: 10 } } },
  ]);
});

test("start_right_after_custom_edit_uses_the_edit", async () => {
  // The blur's settings_set is still in flight when Start is pressed.
  const saving = deferred<null>();
  const { backend } = await renderToday({
    ...savedSettings({ preset: "custom" }),
    settings_set: () => saving.promise,
  });
  const focus = screen.getByLabelText("Focus minutes");

  fireEvent.change(focus, { target: { value: "60" } });
  fireEvent.blur(focus);
  fireEvent.click(screen.getByRole("button", { name: "Start focus" }));
  await settle();

  expect(argsOf(backend.calls, "timer_start")).toEqual([
    { request: { preset: "custom", custom: { focusMin: 60, breakMin: 10 } } },
  ]);
  await act(async () => saving.resolve(null));
});

test("start_with_unparsable_draft_sends_no_custom", async () => {
  const { backend } = await renderToday(savedSettings({ preset: "custom" }));

  fireEvent.change(screen.getByLabelText("Break minutes"), { target: { value: "" } });
  fireEvent.click(screen.getByRole("button", { name: "Start focus" }));
  await settle();

  expect(argsOf(backend.calls, "timer_start")).toEqual([
    { request: { preset: "custom", custom: null } },
  ]);
});

test("start_with_out_of_range_draft_shows_helper", async () => {
  const { backend } = await renderToday({
    ...savedSettings({ preset: "custom" }),
    timer_start: () => Promise.reject(INVALID_SPEC),
  });
  expect(screen.queryByText(RANGE_HELP)).toBeNull();

  fireEvent.change(screen.getByLabelText("Focus minutes"), { target: { value: "2" } });
  fireEvent.click(screen.getByRole("button", { name: "Start focus" }));
  await settle();

  expect(argsOf(backend.calls, "timer_start")).toEqual([
    { request: { preset: "custom", custom: { focusMin: 2, breakMin: 10 } } },
  ]);
  expect(screen.getByText(RANGE_HELP)).toBeInTheDocument();
  expect(screen.getByLabelText("Focus minutes")).not.toHaveAttribute("aria-invalid");
  expect(screen.queryByRole("alert")).toBeNull();
  expect(statusNodes()).toHaveLength(0);
  // Nothing started: the Start button is still there.
  expect(screen.getByRole("button", { name: "Start focus" })).toBeInTheDocument();
});

// Rendering the clock and the view

test("clock_tick_renders_wall_clock_and_idle_finish", async () => {
  const { container } = await renderToday();

  await emitClock({ epochMs: 1, clock: "14:32", idleFinish: "14:57" });

  expect(screen.getByRole("heading", { level: 1, name: "Today" })).toBeInTheDocument();
  const ring = screen.getByRole("timer", { name: "No session" });
  expect(ring).toHaveTextContent("Clock · 14:32");
  expect(outsideRing("No session")).toHaveLength(1);
  expect(container).toHaveTextContent("Realistic finish · 14:57");
  expect(screen.getByRole("button", { name: "Start focus" })).toBeInTheDocument();
});

test("timer_tick_renders_digits_chip_word_and_planned_finish", async () => {
  const { container } = await renderToday();

  await emitClock({ epochMs: 1, clock: "14:55", idleFinish: null });
  await emitTimer(RUNNING);

  expect(
    screen.getByRole("timer", {
      name: "Focus, 24 minutes 59 seconds remaining, Wall clock, 14:55",
    }),
  ).toHaveTextContent("24:59");
  expect(outsideRing("Focus")).toHaveLength(1);
  expect(container).toHaveTextContent("Realistic finish · 15:20");
  expect(screen.getByRole("button", { name: "Pause" })).toHaveAttribute("data-variant", "quiet");
  expect(screen.getByRole("button", { name: "End session" })).toHaveAttribute(
    "data-variant",
    "ghost",
  );
  expect(screen.queryByRole("button", { name: "Start focus" })).toBeNull();
});

test("paused_view_renders_paused_once_and_no_finish_line", async () => {
  const { container } = await renderToday();

  await emitTimer(PAUSED);

  expect(screen.getByRole("timer", { name: /^Paused, 24 minutes 59 seconds remaining/ }));
  expect(outsideRing("Paused")).toHaveLength(1);
  expect(container).not.toHaveTextContent("Realistic finish");
  expect(screen.getByRole("button", { name: "Resume" })).toHaveAttribute("data-variant", "quiet");
  expect(screen.queryByRole("button", { name: "Pause" })).toBeNull();
  expect(screen.getByRole("button", { name: "End session" })).toHaveAttribute(
    "data-variant",
    "ghost",
  );
});

test("running_finish_line_reads_realistic_finish", async () => {
  await renderToday();

  await emitTimer(RUNNING);

  const time = screen.getByText("15:20");
  expect(time).toHaveClass("font-mono", "tabular-nums");
  const line = time.closest("p");
  expect(line).toHaveTextContent(/^Realistic finish · 15:20$/);
  expect(line).toHaveClass("app-muted");
});

test("pause_resume_and_end_call_their_commands", async () => {
  const { backend } = await renderToday();
  await emitTimer(RUNNING);
  fireEvent.click(screen.getByRole("button", { name: "Pause" }));
  await emitTimer(PAUSED);
  fireEvent.click(screen.getByRole("button", { name: "Resume" }));
  fireEvent.click(screen.getByRole("button", { name: "End session" }));
  await settle();

  expect(backend.calls.map((call) => call.cmd)).toEqual(
    expect.arrayContaining(["timer_pause", "timer_resume", "timer_stop"]),
  );
});
