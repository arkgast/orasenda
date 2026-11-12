import { clearMocks } from "@tauri-apps/api/mocks";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { resetSettingsQueueForTests } from "../../ipc/settingsQueue";
import {
  emitFocusInsets,
  emitMilestone,
  emitTimer,
  mockBackend,
  PAUSED,
  RUNNING,
  SETTINGS,
  settle,
} from "../../test/fixtures";
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
  window.history.replaceState({}, "", "/");
});

const page = () => document.querySelector<HTMLElement>('[data-slot="focus-page"]') as HTMLElement;

test("focus_page_follows_the_saved_theme", async () => {
  mockBackend({ settings_get: () => ({ ...SETTINGS, theme: "dark" }) });
  render(<FocusPage />);
  await settle();
  expect(screen.getByRole("region", { name: "Full-screen focus" })).toBeInTheDocument();
  expect(screen.getByRole("main", { name: "Focus session" })).toBeInTheDocument();
  expect(document.documentElement.dataset.theme).toBe("dark");
});

test("focus_page_reads_timer_view_not_state", async () => {
  const backend = mockBackend({ timer_view: () => RUNNING });
  render(<FocusPage />);
  await settle();
  const commandNames = backend.calls.map((call) => call.cmd);
  expect(commandNames).toContain("timer_view");
  expect(commandNames).not.toContain("timer_state");
  expect(screen.getByRole("timer")).toHaveAccessibleName(/24 minutes 59 seconds remaining/);
  await emitTimer({ ...PAUSED, remaining: "20:00", remainingLabel: "20 minutes" });
  expect(screen.getByRole("timer")).toHaveAccessibleName(/20 minutes remaining/);
  expect(screen.getByRole("button", { name: "Resume session" })).toBeInTheDocument();
});

test("focus_page_insets_from_query_and_event", async () => {
  window.history.replaceState({}, "", "/focus.html?display=1&insets=10,20,30,40");
  mockBackend();
  render(<FocusPage />);
  await settle();
  const style = page().style;
  expect(style.getPropertyValue("--focus-inset-top")).toBe("10px");
  expect(style.getPropertyValue("--focus-inset-right")).toBe("20px");
  expect(style.getPropertyValue("--focus-inset-bottom")).toBe("30px");
  expect(style.getPropertyValue("--focus-inset-left")).toBe("40px");
  await emitFocusInsets({ top: 0, right: 0, bottom: 0, left: 8 });
  expect(style.getPropertyValue("--focus-inset-top")).toBe("0px");
  expect(style.getPropertyValue("--focus-inset-left")).toBe("8px");
});

test("focus_page_without_insets_pads_nothing", async () => {
  window.history.replaceState({}, "", "/focus.html?display=1&insets=nonsense");
  mockBackend();
  render(<FocusPage />);
  await settle();
  expect(page().style.getPropertyValue("--focus-inset-top")).toBe("0px");
});

test("focus_page_summary_only_while_idle_or_ended", async () => {
  mockBackend({ timer_view: () => RUNNING });
  render(<FocusPage />);
  await settle();
  expect(screen.queryByRole("button", { name: /^Preset / })).toBeNull();
  await emitTimer({ ...RUNNING, state: "idle", mode: "idle", sessionId: null });
  expect(screen.getByRole("button", { name: /^Preset Steady Focus/ })).toBeInTheDocument();
});

test("focus_page_ended_milestone_shows_the_end", async () => {
  mockBackend();
  render(<FocusPage />);
  await settle();
  await emitMilestone({ kind: "ended", endReason: "completed", sessionId: "s1" });
  expect(screen.getByRole("status")).toHaveTextContent("Session ended.");
});

test("focus_page_choosing_a_preset_saves_it_through_preset_select", async () => {
  const backend = mockBackend();
  render(<FocusPage />);
  await settle();
  fireEvent.click(screen.getByRole("button", { name: /^Preset Steady Focus/ }));
  fireEvent.click(screen.getByRole("menuitemradio", { name: /Deep Work/ }));
  await settle();
  const sent = backend.calls.filter((call) => call.cmd === "preset_select");
  expect(sent).toHaveLength(1);
  expect(sent[0].args).toMatchObject({ presetId: "0192f6a0-0000-7000-8000-000000000003" });
});

test("focus_command_failure_in_status_line", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  mockBackend({
    timer_view: () => RUNNING,
    timer_pause: () => Promise.reject({ kind: "store", message: "disk full" }),
  });
  render(<FocusPage />);
  await settle();
  fireEvent.click(screen.getByRole("button", { name: "Pause session" }));
  await settle();
  expect(screen.getByRole("status")).toHaveTextContent("Orasenda's timer isn't responding.");
  // The next view clears it.
  await emitTimer(PAUSED);
  expect(screen.getByRole("status")).not.toHaveTextContent("isn't responding");
});

test("focus_preset_failure_in_status_line", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  mockBackend({ preset_select: () => Promise.reject({ kind: "store", message: "disk full" }) });
  render(<FocusPage />);
  await settle();
  fireEvent.click(screen.getByRole("button", { name: /^Preset Steady Focus/ }));
  fireEvent.click(screen.getByRole("menuitemradio", { name: /Deep Work/ }));
  await settle();
  expect(screen.getByRole("status")).toHaveTextContent("That preset didn't save.");
});

test("focus_view_unreadable_line", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  mockBackend({ timer_view: () => Promise.reject({ kind: "store", message: "no timer" }) });
  render(<FocusPage />);
  await settle();
  expect(screen.getByRole("status")).toHaveTextContent(
    "Orasenda can't reach the timer. Close this window and try again.",
  );
});
