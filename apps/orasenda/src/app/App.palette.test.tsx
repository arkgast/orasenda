import { resetSettingsQueueForTests } from "@shared/ipc/settingsQueue";
import { resetTimerQueueForTests } from "@shared/ipc/timerQueue";
import { boardOf, boardTask, emitPaletteOpen, mockBackend, settle } from "@shared/test/fixtures";
import { stubPaletteDom } from "@shared/test/paletteDom";
import { clearMocks } from "@tauri-apps/api/mocks";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { App } from "./App";

beforeEach(() => {
  stubPaletteDom();
  resetTimerQueueForTests();
  resetSettingsQueueForTests();
});
afterEach(async () => {
  cleanup();
  await settle();
  resetSettingsQueueForTests();
  clearMocks();
  vi.restoreAllMocks();
});

test("choose_task_remounts_with_empty_query", async () => {
  mockBackend({ board_get: () => boardOf([boardTask("d", "Fix the build", "doing")]) });
  render(<App />);
  await settle();
  await emitPaletteOpen();
  const field = screen.getByRole("combobox");
  fireEvent.change(field, { target: { value: "choose" } });
  fireEvent.click(screen.getByRole("option", { name: "Choose a task…" }));
  await settle();
  expect(screen.getAllByRole("dialog")).toHaveLength(1);
  expect(screen.getByRole("combobox")).toHaveValue("");
  const options = screen.getAllByRole("option");
  expect(options).toHaveLength(1);
  expect(options[0]).toHaveTextContent("Fix the build");
  expect(options[0]).toHaveTextContent("Doing");
});

test("esc_in_task_mode_returns_focus_to_first_opener", async () => {
  mockBackend({ board_get: () => boardOf([boardTask("d", "Fix the build", "doing")]) });
  render(<App />);
  await settle();
  const opener = screen.getByRole("button", { name: /Start focus/ });
  opener.focus();
  await emitPaletteOpen();
  fireEvent.click(screen.getByRole("option", { name: "Choose a task…" }));
  await settle();
  fireEvent.keyDown(screen.getByRole("combobox"), { key: "Escape" });
  await settle();
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(opener).toHaveFocus();
});
