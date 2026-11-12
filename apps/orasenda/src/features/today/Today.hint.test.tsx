import { clearMocks } from "@tauri-apps/api/mocks";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { resetSettingsQueueForTests } from "../../ipc/settingsQueue";
import { resetTimerQueueForTests } from "../../ipc/timerQueue";
import { argsOf, emitTimer, mockBackend, RUNNING, settle } from "../../test/fixtures";
import { resetPresetsForTests } from "./presets";
import { Today } from "./Today";
import { statusNodes } from "./Today.support";

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

const HINT = "You can keep going automatically in Settings › Timer.";
const HINTED = { ...RUNNING, hint: "keepGoing" as const };

async function renderWith(onNavigate = vi.fn()) {
  resetPresetsForTests();
  const backend = mockBackend();
  render(<Today onNavigate={onNavigate} />);
  await settle();
  return { backend, onNavigate };
}

test("today_calls_hint_shown_once", async () => {
  const { backend } = await renderWith();
  await emitTimer(RUNNING);
  expect(argsOf(backend.calls, "hint_shown")).toHaveLength(0);

  await emitTimer(HINTED);
  expect(statusNodes()[0]).toHaveTextContent(HINT);
  expect(argsOf(backend.calls, "hint_shown")).toEqual([{ hint: "keepGoing" }]);

  // More views, with and without the hint: still one call, and the line stays for this focus.
  await emitTimer(HINTED);
  await emitTimer(RUNNING);
  expect(statusNodes()[0]).toHaveTextContent(HINT);
  expect(argsOf(backend.calls, "hint_shown")).toHaveLength(1);
});

test("hint_outranked_waits_without_calling_hint_shown", async () => {
  const { backend } = await renderWith();
  await emitTimer({ ...HINTED, mode: "warning", canExtend: true });
  expect(statusNodes()[0]).toHaveTextContent("Two minutes left. Finish the thought.");
  expect(argsOf(backend.calls, "hint_shown")).toHaveLength(0);
});

test("open_settings_targets_keep_going", async () => {
  const { onNavigate } = await renderWith();
  await emitTimer(HINTED);
  fireEvent.click(screen.getByRole("button", { name: "Open Timer settings" }));
  expect(onNavigate).toHaveBeenCalledWith("settings", "keepGoing");
});
