import { clearMocks } from "@tauri-apps/api/mocks";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { resetSettingsQueueForTests } from "../../ipc/settingsQueue";
import {
  argsOf,
  emitMilestone,
  mockBackend,
  PAUSED,
  type Replies,
  RUNNING,
  SETTINGS,
  settle,
} from "../../test/fixtures";
import { resetPresetsForTests } from "../today/presets";
import { FocusPage } from "./FocusPage";

beforeEach(() => {
  resetSettingsQueueForTests();
  resetPresetsForTests();
});

afterEach(async () => {
  cleanup();
  await settle();
  clearMocks();
  vi.restoreAllMocks();
});

async function open(replies: Replies = {}) {
  const backend = mockBackend(replies);
  render(<FocusPage />);
  await settle();
  return backend;
}

/** Presses a key on the window and returns whether the page left it alone (not prevented). */
function press(init: KeyboardEventInit): boolean {
  return fireEvent.keyDown(screen.getByRole("region", { name: "Full-screen focus" }), init);
}

const cmdEnter = { key: "Enter", metaKey: true };
const cmdPeriod = { key: ".", metaKey: true };

test("focus_cmd_enter_starts_saved_custom_null", async () => {
  const backend = await open();
  expect(press(cmdEnter)).toBe(false);
  await settle();
  // The saved preset: `quick: false` (Rust starts the selected library preset; no custom length).
  expect(argsOf(backend.calls, "timer_start")).toEqual([{ request: { quick: false } }]);
});

test("focus_cmd_enter_starts_after_an_end_and_not_while_in_session", async () => {
  const backend = await open({ timer_view: () => RUNNING });
  expect(press(cmdEnter)).toBe(true);
  expect(argsOf(backend.calls, "timer_start")).toEqual([]);
  cleanup();
  const ended = await open();
  await emitMilestone({ kind: "ended", endReason: "completed", sessionId: "s1" });
  expect(press(cmdEnter)).toBe(false);
  await settle();
  expect(argsOf(ended.calls, "timer_start")).toHaveLength(1);
});

test("focus_cmd_period_ends_only_in_session", async () => {
  const idle = await open();
  expect(press(cmdPeriod)).toBe(true);
  expect(argsOf(idle.calls, "timer_stop")).toEqual([]);
  cleanup();
  for (const view of [RUNNING, PAUSED]) {
    const backend = await open({ timer_view: () => view });
    expect(press(cmdPeriod)).toBe(false);
    await settle();
    expect(argsOf(backend.calls, "timer_stop")).toHaveLength(1);
    cleanup();
  }
});

test("focus_exit_closes_only_after_confirm", async () => {
  const backend = await open({ timer_view: () => RUNNING });
  fireEvent.keyDown(screen.getByRole("region", { name: "Full-screen focus" }), { key: "Escape" });
  await settle();
  expect(screen.getByRole("dialog", { name: "Leave full screen?" })).toBeInTheDocument();
  expect(argsOf(backend.calls, "focus_view_close")).toEqual([]);
  fireEvent.click(screen.getByRole("button", { name: "Stay in full screen" }));
  await settle();
  expect(argsOf(backend.calls, "focus_view_close")).toEqual([]);
  fireEvent.click(screen.getByRole("button", { name: "Leave full screen" }));
  const dialog = await screen.findByRole("dialog", { name: "Leave full screen?" });
  fireEvent.click(within(dialog).getByRole("button", { name: "Leave full screen" }));
  await settle();
  expect(argsOf(backend.calls, "focus_view_close")).toHaveLength(1);
});

test("focus_close_failure_in_status_line", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  await open({
    timer_view: () => RUNNING,
    focus_view_close: () => Promise.reject({ kind: "unavailable", message: "no window" }),
  });
  fireEvent.click(screen.getByRole("button", { name: "Leave full screen" }));
  const dialog = await screen.findByRole("dialog", { name: "Leave full screen?" });
  fireEvent.click(within(dialog).getByRole("button", { name: "Leave full screen" }));
  await settle();
  expect(screen.getByRole("status")).toHaveTextContent("This window didn't close.");
});

function space(init: KeyboardEventInit = {}, target: Element = document.body): boolean {
  return fireEvent.keyDown(target, { key: " ", ...init });
}

test("focus_page_space_toggles", async () => {
  const idle = await open();
  expect(space()).toBe(false);
  await settle();
  expect(argsOf(idle.calls, "timer_start")).toEqual([{ request: { quick: false } }]);
  cleanup();
  const running = await open({ timer_view: () => RUNNING });
  space();
  await settle();
  expect(argsOf(running.calls, "timer_pause")).toHaveLength(1);
  cleanup();
  const paused = await open({ timer_view: () => PAUSED });
  space();
  await settle();
  expect(argsOf(paused.calls, "timer_resume")).toHaveLength(1);
});

test("focus_page_space_ignored_on_a_button_with_a_modifier_or_off", async () => {
  const backend = await open({ timer_view: () => RUNNING });
  space({}, screen.getByRole("button", { name: "End session" }));
  space({ shiftKey: true });
  space({ repeat: true });
  await settle();
  expect(argsOf(backend.calls, "timer_pause")).toEqual([]);
  cleanup();
  const off = await open({
    timer_view: () => RUNNING,
    settings_get: () => ({ ...SETTINGS, singleKey: false }),
  });
  expect(space()).toBe(true);
  await settle();
  expect(argsOf(off.calls, "timer_pause")).toEqual([]);
  expect(screen.queryByText("Space")).not.toBeInTheDocument();
});
