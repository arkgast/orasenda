import { resetFlowAsk } from "@features/review/flowAsk";
import { resetSettingsQueueForTests } from "@shared/ipc/settingsQueue";
import { resetTimerQueueForTests } from "@shared/ipc/timerQueue";
import {
  boardOf,
  boardTask,
  emitPaletteOpen,
  mockBackend,
  reviewView,
  settle,
  shutdownView,
  weeklyView,
} from "@shared/test/fixtures";
import { stubPaletteDom } from "@shared/test/paletteDom";
import { clearMocks } from "@tauri-apps/api/mocks";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { App } from "./App";

beforeEach(() => {
  stubPaletteDom();
  resetTimerQueueForTests();
  resetSettingsQueueForTests();
  resetFlowAsk();
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
  expect(screen.getByRole("combobox")).toHaveFocus();
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

test("palette_start_shutdown_opens_once", async () => {
  mockBackend({ review_get: () => reviewView(), shutdown_get: () => shutdownView() });
  render(<App />);
  await settle();
  await emitPaletteOpen();
  fireEvent.click(screen.getByRole("option", { name: "Start shutdown" }));
  await settle();
  expect(screen.queryByRole("combobox")).toBeNull();
  // The flow opens on the Review page, with focus on its first heading.
  const heading = screen.getByRole("heading", { level: 1, name: "Unfinished tasks" });
  expect(heading).toHaveFocus();
  // Ending it and coming back later shows the overview: the ask was used up.
  fireEvent.keyDown(heading, { key: "Escape" });
  await settle();
  expect(screen.getByRole("heading", { level: 1, name: "Review" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Today" }));
  await settle();
  fireEvent.click(screen.getByRole("button", { name: "Review" }));
  await settle();
  expect(screen.getByRole("heading", { level: 1, name: "Review" })).toBeInTheDocument();
  expect(screen.queryByRole("heading", { level: 1, name: "Unfinished tasks" })).toBeNull();
});

test("palette_start_shutdown_from_the_review_page_opens_the_flow_again", async () => {
  mockBackend({ review_get: () => reviewView(), shutdown_get: () => shutdownView() });
  render(<App />);
  await settle();
  fireEvent.click(screen.getByRole("button", { name: "Review" }));
  await settle();
  await emitPaletteOpen();
  fireEvent.click(screen.getByRole("option", { name: "Start shutdown" }));
  await settle();
  expect(screen.getByRole("heading", { level: 1, name: "Unfinished tasks" })).toBeInTheDocument();
});

test("palette_start_weekly_opens_once", async () => {
  mockBackend({ review_get: () => reviewView(), weekly_get: () => weeklyView() });
  render(<App />);
  await settle();
  await emitPaletteOpen();
  fireEvent.click(screen.getByRole("option", { name: "Start weekly review" }));
  await settle();
  expect(screen.queryByRole("combobox")).toBeNull();
  const heading = screen.getByRole("heading", { level: 1, name: "Look back" });
  expect(heading).toHaveFocus();
  // Ending it and coming back later shows the overview: the ask was used up.
  fireEvent.keyDown(heading, { key: "Escape" });
  await settle();
  expect(screen.getByRole("heading", { level: 1, name: "Review" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Today" }));
  await settle();
  fireEvent.click(screen.getByRole("button", { name: "Review" }));
  await settle();
  expect(screen.getByRole("heading", { level: 1, name: "Review" })).toBeInTheDocument();
  expect(screen.queryByRole("heading", { level: 1, name: "Look back" })).toBeNull();
});
