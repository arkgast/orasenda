import { clearMocks } from "@tauri-apps/api/mocks";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { Settings } from "../../ipc/bindings";
import { resetSettingsQueueForTests } from "../../ipc/settingsQueue";
import { resetTimerQueueForTests } from "../../ipc/timerQueue";
import { argsOf, settle } from "../../test/fixtures";
import { INVALID_SPEC, RANGE_HELP, renderToday, savedSettings, statusNodes } from "./Today.support";

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

// Per-field range helpers (#118)

const FOCUS_HELP = RANGE_HELP;
const BREAK_HELP = "Between 1 and 60 minutes.";

function rejectOutOfRange(args: unknown) {
  const { focusMin, breakMin } = (args as { settings: Settings }).settings.custom;
  const focusBad = focusMin < 5 || focusMin > 180;
  const breakBad = breakMin < 1 || breakMin > 60;
  return focusBad || breakBad ? Promise.reject(INVALID_SPEC) : null;
}

test("break_out_of_range_shows_break_helper_only", async () => {
  await renderToday({ ...savedSettings({ preset: "custom" }), settings_set: rejectOutOfRange });
  const brk = screen.getByLabelText("Break minutes");

  fireEvent.change(brk, { target: { value: "90" } });
  fireEvent.blur(brk);
  await settle();

  expect(brk).toHaveAccessibleDescription(BREAK_HELP);
  expect(screen.queryByText(FOCUS_HELP)).toBeNull();
  expect(screen.getByLabelText("Focus minutes")).not.toHaveAccessibleDescription(FOCUS_HELP);
  expect(brk).not.toHaveAttribute("aria-invalid");
  expect(screen.queryByRole("alert")).toBeNull();
  expect(statusNodes()).toHaveLength(0);
  expect(brk).toHaveValue(90);
});

test("focus_out_of_range_shows_focus_helper_only", async () => {
  await renderToday({ ...savedSettings({ preset: "custom" }), settings_set: rejectOutOfRange });
  const focus = screen.getByLabelText("Focus minutes");

  fireEvent.change(focus, { target: { value: "200" } });
  fireEvent.blur(focus);
  await settle();

  expect(focus).toHaveAccessibleDescription(FOCUS_HELP);
  expect(screen.queryByText(BREAK_HELP)).toBeNull();
  expect(screen.getByLabelText("Break minutes")).not.toHaveAccessibleDescription(BREAK_HELP);
});

test("both_out_of_range_show_both_helpers", async () => {
  const { backend } = await renderToday({
    ...savedSettings({ preset: "custom" }),
    settings_set: rejectOutOfRange,
  });
  const focus = screen.getByLabelText("Focus minutes");
  const brk = screen.getByLabelText("Break minutes");

  fireEvent.change(focus, { target: { value: "2" } });
  fireEvent.change(brk, { target: { value: "0" } });
  fireEvent.blur(brk);
  await settle();

  expect(argsOf(backend.calls, "settings_set")).toHaveLength(1);
  expect(focus).toHaveAccessibleDescription(FOCUS_HELP);
  expect(brk).toHaveAccessibleDescription(BREAK_HELP);
  expect(screen.getAllByText(FOCUS_HELP)).toHaveLength(1);
  expect(screen.getAllByText(BREAK_HELP)).toHaveLength(1);
});

test("refused_custom_start_shows_helper_on_the_offending_field", async () => {
  const { backend } = await renderToday({
    ...savedSettings({ preset: "custom" }),
    timer_start: () => Promise.reject(INVALID_SPEC),
  });

  fireEvent.change(screen.getByLabelText("Break minutes"), { target: { value: "75" } });
  fireEvent.click(screen.getByRole("button", { name: "Start focus" }));
  await settle();

  expect(argsOf(backend.calls, "timer_start")).toEqual([
    { request: { preset: "custom", custom: { focusMin: 45, breakMin: 75 } } },
  ]);
  expect(screen.getByLabelText("Break minutes")).toHaveAccessibleDescription(BREAK_HELP);
  expect(screen.queryByText(FOCUS_HELP)).toBeNull();
  expect(screen.queryByRole("alert")).toBeNull();
  expect(statusNodes()).toHaveLength(0);
  expect(screen.getByRole("button", { name: "Start focus" })).toBeInTheDocument();
});

test("committing_the_saved_spec_again_clears_the_break_helper", async () => {
  const { backend } = await renderToday({
    ...savedSettings({ preset: "custom" }),
    settings_set: rejectOutOfRange,
  });
  const brk = screen.getByLabelText("Break minutes");

  fireEvent.change(brk, { target: { value: "90" } });
  fireEvent.blur(brk);
  await settle();
  expect(screen.getByText(BREAK_HELP)).toBeInTheDocument();

  fireEvent.change(brk, { target: { value: "10" } });
  fireEvent.blur(brk);
  await settle();

  expect(screen.queryByText(BREAK_HELP)).toBeNull();
  expect(argsOf(backend.calls, "settings_set")).toHaveLength(1);
});

test("successful_start_clears_the_break_helper", async () => {
  let calls = 0;
  await renderToday({
    ...savedSettings({ preset: "custom" }),
    timer_start: () => (calls++ === 0 ? Promise.reject(INVALID_SPEC) : null),
  });
  const brk = screen.getByLabelText("Break minutes");

  fireEvent.change(brk, { target: { value: "75" } });
  fireEvent.click(screen.getByRole("button", { name: "Start focus" }));
  await settle();
  expect(screen.getByText(BREAK_HELP)).toBeInTheDocument();

  fireEvent.change(brk, { target: { value: "10" } });
  fireEvent.click(screen.getByRole("button", { name: "Start focus" }));
  await settle();

  expect(screen.queryByText(BREAK_HELP)).toBeNull();
});

test("refused_start_with_unparsable_draft_shows_both_helpers", async () => {
  await renderToday({
    ...savedSettings({ preset: "custom" }),
    timer_start: () => Promise.reject(INVALID_SPEC),
  });

  fireEvent.change(screen.getByLabelText("Break minutes"), { target: { value: "" } });
  fireEvent.click(screen.getByRole("button", { name: "Start focus" }));
  await settle();

  expect(screen.getByText(FOCUS_HELP)).toBeInTheDocument();
  expect(screen.getByText(BREAK_HELP)).toBeInTheDocument();
});
