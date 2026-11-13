import { clearMocks } from "@tauri-apps/api/mocks";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { onIntentFieldRequest, resetIntentEventsForTests } from "../../features/today/intentEvents";
import { resetSettingsQueueForTests } from "../../ipc/settingsQueue";
import {
  argsOf,
  GENTLE,
  mockBackend,
  PAUSED,
  RUNNING,
  SETTINGS,
  settle,
} from "../../test/fixtures";
import { stubPaletteDom } from "../../test/paletteDom";
import { Palette } from "./Palette";

beforeEach(() => {
  stubPaletteDom();
  resetSettingsQueueForTests();
});
afterEach(async () => {
  resetIntentEventsForTests();
  cleanup();
  await settle();
  resetSettingsQueueForTests();
  clearMocks();
  vi.restoreAllMocks();
});

async function open(replies = {}) {
  const backend = mockBackend(replies);
  const onClose = vi.fn();
  const onNavigate = vi.fn();
  render(<Palette compact={false} onClose={onClose} onNavigate={onNavigate} />);
  await settle();
  return { backend, onClose, onNavigate };
}

test("palette_lists_start_first_and_runs_it", async () => {
  const { backend, onClose } = await open();
  const options = screen.getAllByRole("option");
  expect(options[0]).toHaveTextContent("Start focus · Steady Focus 25 min");
  fireEvent.click(options[0]);
  await settle();
  expect(argsOf(backend.calls, "timer_start")).toEqual([{ request: { quick: false } }]);
  expect(onClose).toHaveBeenCalled();
});

test("palette_row_runs_focus_view_and_navigation", async () => {
  const { backend } = await open();
  fireEvent.click(screen.getByRole("option", { name: /Floating timer/ }));
  await settle();
  expect(argsOf(backend.calls, "focus_view_open")).toEqual([{ target: { kind: "floater" } }]);
  cleanup();
  const again = await open();
  fireEvent.click(screen.getByRole("option", { name: /Go to Settings/ }));
  expect(again.onNavigate).toHaveBeenCalledWith("settings");
});

test("palette_theme_and_preset_rows_save_settings", async () => {
  const { backend } = await open();
  fireEvent.click(screen.getByRole("option", { name: /Theme: Dark/ }));
  await settle();
  const saved = argsOf(backend.calls, "settings_set") as { settings?: { theme?: string } }[];
  expect(saved.length).toBeGreaterThan(0);
  expect(JSON.stringify(saved)).toContain('"theme":"dark"');
});

test("palette_set_intent_opens_field", async () => {
  const asked = vi.fn(() => true);
  const stop = onIntentFieldRequest(asked);
  const { onNavigate, onClose } = await open({ timer_view: () => RUNNING });
  fireEvent.click(screen.getByRole("option", { name: /Set intent/ }));
  expect(onNavigate).toHaveBeenCalledWith("today");
  expect(onClose).toHaveBeenCalled();
  expect(asked).not.toHaveBeenCalled();
  await new Promise((resolve) => setTimeout(resolve, 10));
  expect(asked).toHaveBeenCalled();
  stop();
});

const FAIL = () => {
  throw new Error("boom");
};
// A plain object is what typedError turns into a { status: "error" } result.
const REFUSE = () => {
  throw { kind: "unavailable" };
};
const FAILURES = [
  ["throws", FAIL],
  ["refuses", REFUSE],
] as const;

test.each([
  ["Start focus", {}, "timer_start", { request: { quick: false } }],
  ["Pause session", { timer_view: () => RUNNING }, "timer_pause", undefined],
  ["Resume session", { timer_view: () => PAUSED }, "timer_resume", undefined],
  ["End session", { timer_view: () => RUNNING }, "timer_stop", undefined],
  ["Floating timer", {}, "focus_view_open", { target: { kind: "floater" } }],
  ["Just 2 minutes", {}, "timer_start", { request: { quick: true } }],
  [
    "Full screen on Built-in",
    {},
    "focus_view_open",
    { target: { kind: "fullScreen", displayId: "1" } },
  ],
  [
    "Use preset: Gentle",
    {},
    "settings_set",
    { settings: expect.objectContaining({ presetId: GENTLE }) },
  ],
  ["Theme: Dark", {}, "settings_set", { settings: expect.objectContaining({ theme: "dark" }) }],
  [
    "Turn notifications off",
    {},
    "settings_set",
    { settings: expect.objectContaining({ notifySessionEnd: false }) },
  ],
])("palette_row_calls_its_command: %s", async (label, replies, cmd, args) => {
  const { backend } = await open(replies);
  fireEvent.click(screen.getByRole("option", { name: new RegExp(label) }));
  await settle();
  const calls = argsOf(backend.calls, cmd);
  expect(calls.length).toBeGreaterThan(0);
  if (args) expect(calls).toEqual([args]);
});

test.each([
  ["Start focus", "timer_start", {}, "Couldn't start focus. Please try again."],
  [
    "Pause session",
    "timer_pause",
    { timer_view: () => RUNNING },
    "Couldn't pause. Please try again.",
  ],
  [
    "Resume session",
    "timer_resume",
    { timer_view: () => PAUSED },
    "Couldn't resume. Please try again.",
  ],
  [
    "End session",
    "timer_stop",
    { timer_view: () => RUNNING },
    "Couldn't end the session. Please try again.",
  ],
])("failed_row_keeps_palette_open_with_line: %s", async (label, cmd, replies, line) => {
  for (const [, fail] of FAILURES) {
    vi.spyOn(console, "error")
      .mockImplementation(() => {})
      .mockClear();
    const { onClose } = await open({ ...replies, [cmd]: fail });
    fireEvent.click(screen.getByRole("option", { name: new RegExp(label) }));
    await settle();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent(line);
    expect(console.error).toHaveBeenCalled();
    cleanup();
  }
});

test.each(FAILURES)("focus_view_open_failure_shows_line: %s", async (_name, fail) => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const { onClose } = await open({ focus_view_open: fail });
  fireEvent.click(screen.getByRole("option", { name: /Floating timer/ }));
  await settle();
  expect(onClose).not.toHaveBeenCalled();
  expect(screen.getByRole("status")).toHaveTextContent(
    "Couldn't open the Focus view. Please try again.",
  );
});

test("line_clears_when_another_row_is_chosen", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  await open({ timer_start: FAIL });
  fireEvent.click(screen.getByRole("option", { name: /Start focus/ }));
  await settle();
  expect(screen.getByRole("status")).toHaveTextContent("Couldn't");
  fireEvent.click(screen.getByRole("option", { name: /Go to Settings/ }));
  expect(screen.getByRole("status")).toBeEmptyDOMElement();
});

test("line_clears_on_query_change", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  await open({ timer_start: FAIL });
  fireEvent.click(screen.getByRole("option", { name: /Start focus/ }));
  await settle();
  expect(screen.getByRole("status")).toHaveTextContent("Couldn't");
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "Go to" } });
  expect(screen.getByRole("status")).toBeEmptyDOMElement();
});

test("success_closes_palette", async () => {
  const { onClose } = await open();
  fireEvent.click(screen.getByRole("option", { name: /Start focus/ }));
  await settle();
  expect(onClose).toHaveBeenCalledTimes(1);
});

test.each([
  ["Use preset: Gentle", "Couldn't change the preset. Please try again."],
  ["Theme: Dark", "Couldn't change the theme. Please try again."],
  ["Turn notifications off", "Couldn't turn off notifications. Please try again."],
])("failed_settings_row_keeps_palette_open_with_line: %s", async (label, line) => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const { onClose } = await open({ settings_set: FAIL });
  fireEvent.click(screen.getByRole("option", { name: new RegExp(label) }));
  await settle();
  expect(onClose).not.toHaveBeenCalled();
  expect(screen.getByRole("status")).toHaveTextContent(line);
});

test.each([["Use preset: Gentle"], ["Theme: Dark"], ["Turn notifications off"]])(
  "settings_row_success_closes_palette: %s",
  async (label) => {
    const { onClose } = await open();
    fireEvent.click(screen.getByRole("option", { name: new RegExp(label) }));
    await settle();
    expect(onClose).toHaveBeenCalledTimes(1);
  },
);

test("notifications_on_asks_macos_first_when_not_determined", async () => {
  const { backend } = await open({
    timer_view: () => ({ ...RUNNING, notifications: "notDetermined" }),
    settings_get: () => ({ ...SETTINGS, notifySessionEnd: false }),
  });
  fireEvent.click(screen.getByRole("option", { name: /Turn notifications on/ }));
  await settle();
  expect(argsOf(backend.calls, "notifications_request").length).toBe(1);
  expect(JSON.stringify(argsOf(backend.calls, "settings_set"))).toContain(
    '"notifySessionEnd":true',
  );
});

test("declined_notifications_prompt_closes_palette_with_no_line", async () => {
  const { onClose } = await open({
    timer_view: () => ({ ...RUNNING, notifications: "notDetermined" }),
    settings_get: () => ({ ...SETTINGS, notifySessionEnd: false }),
    notifications_request: () => "denied",
  });
  fireEvent.click(screen.getByRole("option", { name: /Turn notifications on/ }));
  await settle();
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("status")).toBeEmptyDOMElement();
});
