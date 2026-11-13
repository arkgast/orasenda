import { resetSettingsQueueForTests } from "@shared/ipc/settingsQueue";
import {
  argsOf,
  BREAK,
  IDLE,
  mockBackend,
  PRESETS,
  RUNNING,
  SETTINGS,
  settle,
} from "@shared/test/fixtures";
import { clearMocks } from "@tauri-apps/api/mocks";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
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
  delete document.documentElement.dataset.theme;
});

const WARNING = { ...RUNNING, mode: "warning" as const, canExtend: true };

async function mount(view: typeof RUNNING, replies: Parameters<typeof mockBackend>[0] = {}) {
  const backend = mockBackend({
    timer_view: () => view,
    settings_get: () => SETTINGS,
    presets_list: () => PRESETS,
    ...replies,
  });
  render(<FocusPage />);
  await settle();
  return backend;
}

test("focus_page_break_and_warning_modes", async () => {
  await mount({ ...BREAK, intent: null });
  expect(screen.getByRole("timer")).toHaveAccessibleName(/^Break, 4 minutes 59 seconds remaining/);
  expect(screen.getByRole("button", { name: "End break" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Pause break" })).toBeVisible();
  cleanup();
  await mount({ ...WARNING, intent: "Write the report" });
  const timer = screen.getByRole("timer");
  expect(timer).toHaveAccessibleName(/^Almost up, 24 minutes 59 seconds remaining/);
  expect(timer).toHaveAccessibleName(/Write the report/);
  expect(screen.getByRole("button", { name: "End session" })).toBeVisible();
  cleanup();
  // A warning inside a break is still a break: the host passes the view's phase.
  await mount({ ...BREAK, mode: "warning" });
  expect(screen.getByRole("button", { name: "End break" })).toBeVisible();
});

test("focus_page_secondary_action_per_state", async () => {
  const backend = await mount({ ...WARNING, canExtend: true });
  fireEvent.click(screen.getByRole("button", { name: "Add 10 minutes of focus" }));
  await settle();
  expect(argsOf(backend.calls, "timer_extend")).toHaveLength(1);
  cleanup();

  const noExtend = await mount({ ...WARNING, canExtend: false });
  expect(screen.queryByRole("button", { name: /10 min/ })).toBeNull();
  expect(noExtend.calls.map((c) => c.cmd)).not.toContain("timer_extend");
  cleanup();

  const skip = await mount(BREAK);
  fireEvent.click(screen.getByRole("button", { name: "Skip break" }));
  await settle();
  expect(skip.calls.map((c) => c.cmd)).toContain("timer_stop");
  cleanup();

  const auto = await mount({ ...RUNNING, checkIn: "Still going · ends 15:40" });
  fireEvent.click(screen.getByRole("button", { name: /Take a break/ }));
  await settle();
  expect(auto.calls.map((c) => c.cmd)).toContain("timer_take_break");
  cleanup();

  const offer = await mount({ ...IDLE, offer: "keepGoing" });
  expect(screen.queryByRole("button", { name: "Start focus" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Keep going with Steady Focus" }));
  await settle();
  expect(argsOf(offer.calls, "timer_start")).toEqual([{ request: { quick: false } }]);
  cleanup();

  const stop = await mount({ ...IDLE, offer: "keepGoing" });
  fireEvent.click(screen.getByRole("button", { name: "Stop here" }));
  await settle();
  expect(stop.calls.map((c) => c.cmd)).toContain("timer_dismiss_offer");
});
