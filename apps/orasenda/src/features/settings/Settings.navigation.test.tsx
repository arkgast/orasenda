import { clearMocks } from "@tauri-apps/api/mocks";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { App } from "../../app/App";
import { resetSettingsQueueForTests } from "../../ipc/settingsQueue";
import { resetTimerQueueForTests } from "../../ipc/timerQueue";
import { argsOf, deferred, emitNavigate, mockBackend, SETTINGS, settle } from "../../test/fixtures";
import { resetNotificationsToggleForTests } from "./notificationsToggle";
import {
  blur,
  breakInput,
  focusInput,
  h1,
  INVALID,
  openSettings,
  saveLine,
  sets,
  type,
  WRITE,
} from "./Settings.support";

beforeEach(() => {
  resetTimerQueueForTests();
  resetSettingsQueueForTests();
  resetNotificationsToggleForTests();
});

afterEach(async () => {
  cleanup();
  await settle();
  resetSettingsQueueForTests();
  clearMocks();
  vi.restoreAllMocks();
  delete document.documentElement.dataset.theme;
});

// ---- Navigation and arrival ----

test("rail_cmd_comma_and_tray_land_on_settings_with_h1_focus", async () => {
  const { container } = await openSettings();
  expect(h1()).toHaveFocus();
  expect(container.querySelectorAll("h1")).toHaveLength(1);
  expect(container.querySelectorAll('[data-slot="button"][data-variant="primary"]')).toHaveLength(
    0,
  );

  fireEvent.click(screen.getByRole("button", { name: "Today" }));
  await settle();
  for (const taken of [{ page: "settings", target: null }, null] as const) {
    cleanup();
    await settle();
    clearMocks();
    resetSettingsQueueForTests();
    mockBackend({ navigate_take: () => taken });
    render(<App />);
    await settle();
    await emitNavigate("settings");
    if (taken === null) {
      expect(screen.getByRole("heading", { level: 1, name: "Today" })).toBeInTheDocument();
    } else {
      expect(h1()).toHaveFocus();
    }
  }
});

test("field_target_focuses_field", async () => {
  // C's "Open Settings" calls navigate(page, target); drive the page through its arrival prop.
  const { Settings: Page } = await import("./Settings");
  mockBackend();
  const { rerender } = render(
    <Page info={{ status: "loading" }} arrival={{ seq: 1, target: "focusMinutes" }} />,
  );
  await settle();
  expect(focusInput()).toHaveFocus();
  rerender(<Page info={{ status: "loading" }} arrival={{ seq: 2, target: "breakMinutes" }} />);
  await settle();
  expect(breakInput()).toHaveFocus();
  rerender(<Page info={{ status: "loading" }} arrival={{ seq: 3, target: "timer" }} />);
  await settle();
  expect(screen.getByRole("heading", { level: 2, name: "Timer" })).toHaveFocus();
});

test("pending_navigation_taken_at_mount", async () => {
  mockBackend({ navigate_take: () => ({ page: "settings", target: null }) });
  render(<App />);
  await settle();
  expect(h1()).toHaveFocus();
});

test("navigate_event_and_take_land_once", async () => {
  const focused = vi.spyOn(HTMLElement.prototype, "focus");
  const backend = mockBackend({ navigate_take: () => ({ page: "settings", target: null }) });
  render(<App />);
  await settle();
  expect(argsOf(backend.calls, "navigate_take")).toHaveLength(1);
  const h1Focuses = () =>
    focused.mock.contexts.filter((el) => (el as HTMLElement).tagName === "H1").length;
  expect(h1Focuses()).toBe(1);

  await emitNavigate("settings");
  expect(argsOf(backend.calls, "navigate_take")).toHaveLength(2);
  expect(h1Focuses()).toBe(1);
});

test("about_reads_unavailable_when_app_info_rejects", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  await openSettings({
    app_info: () => {
      throw new Error("no");
    },
  });
  expect(screen.getByText("Orasenda version unavailable")).toBeInTheDocument();
  expect(
    within(screen.getByRole("navigation", { name: "Settings sections" })).getByText(
      "Version unavailable",
    ),
  ).toBeInTheDocument();
});

test("about_line_and_pending_index_value", async () => {
  const info = deferred<unknown>();
  mockBackend({ app_info: () => info.promise });
  render(<App />);
  await settle();
  fireEvent.click(screen.getByRole("button", { name: "Settings" }));
  await settle();
  expect(screen.queryByText(/^Version/)).toBeNull();
  info.resolve({ name: "Orasenda", version: "0.1.0", os: "macos", arch: "aarch64" });
  await settle();
  expect(screen.getByText("Orasenda 0.1.0 for macOS")).toBeInTheDocument();
  expect(screen.getByText("Version 0.1.0")).toBeInTheDocument();
  expect(
    screen.getByText(
      "Your sessions and settings stay on this Mac. Orasenda doesn't use the network.",
    ),
  ).toBeInTheDocument();
});

// ---- Index ----

test("index_values_follow_each_section", async () => {
  await openSettings({ settings_get: () => ({ ...SETTINGS, theme: "dark", preset: "custom" }) });
  const nav = within(screen.getByRole("navigation", { name: "Settings sections" }));
  expect(nav.getByText("Dark")).toBeInTheDocument();
  expect(nav.getByText("Custom 45/10")).toBeInTheDocument();
  expect(nav.getByText("On")).toBeInTheDocument();
  expect(nav.getByText("Nothing recorded")).toBeInTheDocument();
  expect(nav.getByText("Version 0.1.0")).toBeInTheDocument();

  fireEvent.keyDown(nav.getByRole("button", { name: /^Timer/ }), { key: "Enter" });
  expect(screen.getByRole("heading", { level: 2, name: "Timer" })).toHaveFocus();
});

test("index_shows_problems_in_words", async () => {
  await openSettings({ settings_set: () => Promise.reject(INVALID) });
  const nav = within(screen.getByRole("navigation", { name: "Settings sections" }));
  await type(focusInput(), "3");
  await blur(focusInput());
  expect(nav.getByText("Check focus minutes")).toBeInTheDocument();
});

test("index_says_not_saved_after_a_write_failure", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  await openSettings({ settings_set: () => Promise.reject(WRITE) });
  fireEvent.click(screen.getByRole("radio", { name: "Dark" }));
  await settle();
  const nav = within(screen.getByRole("navigation", { name: "Settings sections" }));
  expect(nav.getByText("Not saved")).toBeInTheDocument();
});

test("check_break_minutes_in_index", async () => {
  await openSettings({ settings_set: () => Promise.reject(INVALID) });
  await type(breakInput(), "70");
  await blur(breakInput());
  const nav = within(screen.getByRole("navigation", { name: "Settings sections" }));
  expect(nav.getByText("Check break minutes")).toBeInTheDocument();
});

test("shift_arrows_step_by_five_in_the_draft", async () => {
  const { backend } = await openSettings();
  fireEvent.keyDown(focusInput(), { key: "ArrowUp", shiftKey: true });
  expect(focusInput()).toHaveValue(50);
  fireEvent.keyDown(focusInput(), { key: "ArrowDown", shiftKey: true });
  fireEvent.keyDown(focusInput(), { key: "ArrowDown", shiftKey: true });
  expect(focusInput()).toHaveValue(40);
  expect(sets(backend)).toHaveLength(0);
});

test("minute_field_write_failure_rolls_back_the_draft", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  await openSettings({ settings_set: () => Promise.reject(WRITE) });
  await type(focusInput(), "50");
  await blur(focusInput());
  expect(focusInput()).toHaveValue(45);
  expect(saveLine()).toHaveTextContent("Focus minutes weren't saved. Back to 45.");
});

test("huge_number_refused_locally", async () => {
  const { backend } = await openSettings();
  await type(focusInput(), "99999999999");
  await blur(focusInput());
  expect(sets(backend)).toHaveLength(0);
  expect(saveLine()).toHaveTextContent("Focus minutes weren't saved. Still using 45.");
});

test("esc_keeps_the_other_fields_error", async () => {
  await openSettings({ settings_set: () => Promise.reject(INVALID) });
  await type(focusInput(), "3");
  await type(breakInput(), "70");
  await blur(breakInput());
  fireEvent.keyDown(focusInput(), { key: "Escape" });
  await settle();
  expect(saveLine()).toHaveTextContent("Break minutes weren't saved. Still using 10.");
  expect(screen.getByRole("button", { name: "Show break minutes" })).toBeInTheDocument();
});

test("load_failure_says_so", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  await openSettings({ settings_get: () => Promise.reject(new Error("nope")) });
  expect(saveLine()).toHaveTextContent("Orasenda can't read settings right now.");
});
