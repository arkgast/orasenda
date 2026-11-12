import { clearMocks } from "@tauri-apps/api/mocks";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { resetSettingsQueueForTests } from "../../ipc/settingsQueue";
import { argsOf, mockBackend, settle } from "../../test/fixtures";
import { stubPaletteDom } from "../../test/paletteDom";
import { Palette } from "./Palette";

beforeEach(() => {
  stubPaletteDom();
  resetSettingsQueueForTests();
});
afterEach(async () => {
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
