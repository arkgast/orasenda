import { resetSettingsQueueForTests } from "@shared/ipc/settingsQueue";
import { resetTimerQueueForTests } from "@shared/ipc/timerQueue";
import { KEYBOARD, mockBackend, settle, withGlobal } from "@shared/test/fixtures";
import { stubPaletteDom } from "@shared/test/paletteDom";
import { clearMocks } from "@tauri-apps/api/mocks";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { Palette } from "./Palette";

beforeEach(() => {
  stubPaletteDom();
  resetTimerQueueForTests();
  resetSettingsQueueForTests();
});

afterEach(async () => {
  cleanup();
  await settle();
  clearMocks();
  vi.restoreAllMocks();
});

async function open(keyboard = KEYBOARD) {
  const backend = mockBackend({ keyboard_state: () => keyboard });
  render(<Palette compact={false} onClose={() => {}} onNavigate={() => {}} />);
  await settle();
  return backend;
}

const row = (name: RegExp) => screen.getByRole("option", { name });

test("palette_hints_from_registry", async () => {
  const rebound = {
    ...KEYBOARD,
    actions: KEYBOARD.actions.map((action) =>
      action.id === "floater"
        ? {
            ...action,
            app: { ...action.app, keys: "Super+KeyU", display: "⌘U", spoken: "Command-U" },
          }
        : action,
    ),
  };
  await open(rebound);
  expect(row(/Floating timer/)).toHaveTextContent("⌘U");
  expect(row(/Full screen on Built-in/)).toHaveTextContent("⌘F");
  // The capture action has no menu key, so the palette shows the Everywhere one while it works.
  expect(row(/Capture a thought/)).toHaveTextContent("⌃⌥N");
});

test("palette_hint_is_missing_for_a_cleared_or_failed_binding", async () => {
  const cleared = withGlobal(KEYBOARD, "capture", { keys: null, display: null, spoken: null });
  await open(cleared);
  expect(row(/Capture a thought/)).not.toHaveTextContent("⌃");
  cleanup();
  await open(withGlobal(KEYBOARD, "capture", { status: "failed" }));
  expect(row(/Capture a thought/)).not.toHaveTextContent("⌃⌥N");
});

test("palette_floater_runs_through_action_run", async () => {
  const backend = await open();
  fireEvent.click(row(/Floating timer/));
  await settle();
  expect(backend.calls.filter((c) => c.cmd === "action_run").map((c) => c.args)).toEqual([
    { id: "floater" },
  ]);
  expect(backend.calls.some((c) => c.cmd === "focus_view_open")).toBe(false);
});
