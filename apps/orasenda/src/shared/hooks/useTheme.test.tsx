import { App } from "@app/App";
import { clearMocks } from "@tauri-apps/api/mocks";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { Settings } from "../ipc/bindings";
import { resetSettingsQueueForTests } from "../ipc/settingsQueue";
import {
  argsOf,
  deferred,
  emitSettingsChanged,
  mockBackend,
  SETTINGS,
  settle,
} from "../test/fixtures";
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
  resetSettingsQueueForTests();
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

test("theme_change_sends_settings_set_with_theme", async () => {
  const backend = mockBackend();
  render(<App />);
  await settle();
  fireEvent.click(screen.getByRole("button", { name: "Settings" }));
  await settle();
  fireEvent.click(screen.getByRole("radio", { name: "Dark" }));
  await settle();
  expect(argsOf(backend.calls, "settings_set")).toEqual([
    { settings: { ...SETTINGS, theme: "dark" } },
  ]);
  // The webview follows Rust's settings-changed, not the radio.
  expect(document.documentElement.dataset.theme).toBeUndefined();
  await emitSettingsChanged({ ...SETTINGS, theme: "dark" });
  expect(document.documentElement.dataset.theme).toBe("dark");
});
