import { clearMocks } from "@tauri-apps/api/mocks";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import {
  argsOf,
  BREAK,
  IDLE,
  mockBackend,
  PRESETS,
  RUNNING,
  SETTINGS,
  settle,
} from "../../test/fixtures";
import { resetPresetsForTests } from "../today/presets";
import { FloaterPage } from "./FloaterPage";

afterEach(async () => {
  cleanup();
  await settle();
  clearMocks();
  vi.restoreAllMocks();
  resetPresetsForTests();
});

async function mount(view: typeof RUNNING) {
  const backend = mockBackend({
    timer_view: () => view,
    settings_get: () => SETTINGS,
    presets_list: () => PRESETS,
  });
  render(<FloaterPage />);
  await settle();
  return backend;
}

test("floater_break_and_warning_modes", async () => {
  await mount(BREAK);
  expect(screen.getByRole("group", { name: "Floating timer, Break" })).toBeVisible();
  cleanup();
  await mount({ ...RUNNING, mode: "warning" });
  expect(screen.getByRole("group", { name: "Floating timer, Almost up" })).toBeVisible();
  cleanup();
  // A warning inside a break is still a break: Skip break stays.
  await mount({ ...BREAK, mode: "warning" });
  expect(screen.getByRole("button", { name: "Skip break" })).toBeVisible();
});

test("floater_skip_break_and_keep_going", async () => {
  const skip = await mount(BREAK);
  expect(screen.queryByRole("button", { name: "Pause break" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Skip break" }));
  await settle();
  expect(skip.calls.map((c) => c.cmd)).toContain("timer_stop");
  cleanup();

  const none = await mount(RUNNING);
  expect(screen.queryByRole("button", { name: "Skip break" })).toBeNull();
  expect(none.calls.map((c) => c.cmd)).not.toContain("timer_stop");
  cleanup();

  const offer = await mount({ ...IDLE, offer: "keepGoing" });
  fireEvent.click(screen.getByRole("button", { name: "Keep going" }));
  await settle();
  expect(argsOf(offer.calls, "timer_start")).toEqual([{ request: { quick: false } }]);
});
