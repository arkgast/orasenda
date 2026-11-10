import { clearMocks } from "@tauri-apps/api/mocks";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { deferred, emitSettingsChanged, mockBackend, SETTINGS, settle } from "./pages/testing";
import type { Settings } from "./bindings";
import { resetSettingsQueueForTests } from "./settingsQueue";
import { useTheme } from "./useTheme";

function Probe() {
  useTheme();
  return null;
}

beforeEach(() => {
  resetSettingsQueueForTests();
});

afterEach(async () => {
  cleanup();
  await settle();
  clearMocks();
  vi.restoreAllMocks();
  delete document.documentElement.dataset.theme;
});

test("settings_changed_sets_data_theme_and_system_removes_it", async () => {
  mockBackend();
  render(<Probe />);
  await settle();
  expect(document.documentElement.dataset.theme).toBeUndefined();
  await emitSettingsChanged({ ...SETTINGS, theme: "light" });
  expect(document.documentElement.dataset.theme).toBe("light");
  await emitSettingsChanged({ ...SETTINGS, theme: "dark" });
  expect(document.documentElement.dataset.theme).toBe("dark");
  await emitSettingsChanged({ ...SETTINGS, theme: "system" });
  expect(document.documentElement.dataset.theme).toBeUndefined();
});

test("event_before_settings_get_answer_wins", async () => {
  const get = deferred<Settings>();
  mockBackend({ settings_get: () => get.promise });
  render(<Probe />);
  await settle();
  await emitSettingsChanged({ ...SETTINGS, theme: "dark" });
  get.resolve({ ...SETTINGS, theme: "light" });
  await settle();
  expect(document.documentElement.dataset.theme).toBe("dark");
});

test("get_answer_sets_theme_at_mount", async () => {
  mockBackend({ settings_get: () => ({ ...SETTINGS, theme: "light" }) });
  render(<Probe />);
  await settle();
  expect(document.documentElement.dataset.theme).toBe("light");
});
