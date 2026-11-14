import { resetSettingsQueueForTests } from "@shared/ipc/settingsQueue";
import { resetTimerQueueForTests } from "@shared/ipc/timerQueue";
import {
  argsOf,
  DISPLAYS,
  emitNavigate,
  emitPaletteOpen,
  emitWindowView,
  fullScreenView,
  mockBackend,
  RUNNING,
  settle,
  WINDOWED,
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
});

afterEach(async () => {
  Object.assign(window, { innerWidth: 1024, innerHeight: 768 });
  cleanup();
  await settle();
  resetSettingsQueueForTests();
  clearMocks();
  vi.restoreAllMocks();
});

const view = () => screen.queryByRole("region", { name: "Full-screen focus" });

test("full_screen_is_main_with_no_rail_or_header", async () => {
  mockBackend({ window_view: () => fullScreenView(), timer_view: () => RUNNING });
  const { container } = render(<App />);
  await settle();
  expect(view()).toBeInTheDocument();
  expect(screen.queryByRole("navigation", { name: "Main navigation" })).toBeNull();
  expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
  expect(container.querySelectorAll("main")).toHaveLength(1);
});

test("the_window_view_event_swaps_the_page_both_ways", async () => {
  mockBackend();
  render(<App />);
  await settle();
  expect(view()).toBeNull();
  expect(screen.getByRole("navigation", { name: "Main navigation" })).toBeInTheDocument();
  await emitWindowView(fullScreenView());
  expect(view()).toBeInTheDocument();
  expect(screen.queryByRole("navigation", { name: "Main navigation" })).toBeNull();
  await emitWindowView(WINDOWED);
  expect(view()).toBeNull();
  expect(screen.getByRole("heading", { level: 1, name: "Today" })).toBeInTheDocument();
});

test("nav_key_leaves_full_screen_first", async () => {
  const backend = mockBackend({ window_view: () => fullScreenView() });
  render(<App />);
  await settle();
  fireEvent.keyDown(document.body, { key: "3", metaKey: true });
  await settle();
  expect(argsOf(backend.calls, "full_screen_leave")).toHaveLength(1);
  // The navigation waited for the leave: when AppKit says so, the page is the one asked for.
  await emitWindowView(WINDOWED);
  expect(screen.getByRole("heading", { level: 1, name: "Calendar" })).toHaveFocus();
});

test("a_failed_leave_does_not_navigate", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  mockBackend({
    window_view: () => fullScreenView(),
    full_screen_leave: () => Promise.reject({ kind: "failed", message: "no" }),
  });
  render(<App />);
  await settle();
  fireEvent.keyDown(document.body, { key: "2", metaKey: true });
  await settle();
  expect(view()).toBeInTheDocument();
  expect(console.error).toHaveBeenCalled();
});

test("choose_display_palette_only_displays", async () => {
  const backend = mockBackend({ window_view: () => fullScreenView() });
  render(<App />);
  await settle();
  await emitPaletteOpen(true);
  const options = screen.getAllByRole("option").map((option) => option.textContent ?? "");
  expect(options).toHaveLength(DISPLAYS.length);
  expect(options[0]).toMatch(/^Full screen on Built-in Retina Display/);
  expect(options[1]).toMatch(/^Full screen on DELL U2720Q/);
  // The palette opened over full screen: the view is still there under it.
  expect(view()).toBeInTheDocument();
  fireEvent.click(screen.getByRole("option", { name: /Full screen on DELL/ }));
  await settle();
  expect(argsOf(backend.calls, "full_screen_enter_on")).toEqual([{ displayId: "2" }]);
});

test("the_ordinary_palette_still_lists_everything", async () => {
  mockBackend();
  render(<App />);
  await settle();
  await emitPaletteOpen();
  expect(screen.getAllByRole("option").length).toBeGreaterThan(DISPLAYS.length);
  expect(screen.getByRole("option", { name: /Go to Board/ })).toBeInTheDocument();
});

test("esc_in_the_palette_closes_only_the_palette", async () => {
  const backend = mockBackend({ window_view: () => fullScreenView() });
  render(<App />);
  await settle();
  await emitPaletteOpen();
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  await settle();
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(argsOf(backend.calls, "full_screen_leave")).toEqual([]);
  expect(view()).toBeInTheDocument();
});

test("full_screen_stays_through_a_window_view_for_the_same_state", async () => {
  // The floater opening or closing over full screen sends no leave from the webview.
  const backend = mockBackend({ window_view: () => fullScreenView() });
  render(<App />);
  await settle();
  await emitWindowView(fullScreenView(0));
  expect(view()).toBeInTheDocument();
  expect(argsOf(backend.calls, "full_screen_leave")).toEqual([]);
});

test("cmd_comma_in_full_screen_on_settings_still_leaves", async () => {
  let pending: { page: string; target: null } | null = { page: "settings", target: null };
  const backend = mockBackend({
    navigate_take: () => {
      const taken = pending;
      pending = null;
      return taken;
    },
  });
  render(<App />);
  await settle();
  expect(screen.getByRole("heading", { level: 1, name: "Settings" })).toBeInTheDocument();
  await emitWindowView(fullScreenView());
  pending = { page: "settings", target: null };
  await emitNavigate("settings");
  await settle();
  expect(argsOf(backend.calls, "full_screen_leave")).toHaveLength(1);
});

test("the_window_view_event_before_the_leave_answer_still_focuses_the_heading", async () => {
  let answer: (value: unknown) => void = () => {};
  mockBackend({
    window_view: () => fullScreenView(),
    full_screen_leave: () =>
      new Promise((resolve) => {
        answer = resolve;
      }),
  });
  render(<App />);
  await settle();
  fireEvent.keyDown(document.body, { key: "3", metaKey: true });
  await settle();
  await emitWindowView(WINDOWED);
  answer({ status: "ok", data: null });
  await settle();
  expect(screen.getByRole("heading", { level: 1, name: "Calendar" })).toHaveFocus();
});

test("leaving_without_navigating_puts_focus_on_the_page_heading", async () => {
  mockBackend({ window_view: () => fullScreenView() });
  render(<App />);
  await settle();
  await emitWindowView(WINDOWED);
  expect(screen.getByRole("heading", { level: 1, name: "Today" })).toHaveFocus();
});
