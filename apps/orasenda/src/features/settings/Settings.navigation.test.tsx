import { App } from "@app/App";
import { resetSettingsQueueForTests } from "@shared/ipc/settingsQueue";
import { resetTimerQueueForTests } from "@shared/ipc/timerQueue";
import { argsOf, deferred, emitNavigate, mockBackend, settle } from "@shared/test/fixtures";
import { clearMocks } from "@tauri-apps/api/mocks";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { resetNotificationsToggleForTests } from "./notificationsToggle";
import { h1, openPane, openSettings, saveLine } from "./Settings.support";

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
  Object.assign(window, { innerWidth: 1024, innerHeight: 768 });
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

test("settings_keep_going_target_focuses_checkbox", async () => {
  const { Settings: Page } = await import("./Settings");
  mockBackend();
  const scrolled = vi.fn();
  Element.prototype.scrollIntoView = scrolled;
  render(
    <Page
      info={{ status: "loading" }}
      arrival={{ seq: 1, target: "keepGoing" }}
      onNavigate={() => {}}
    />,
  );
  await settle();
  const box = screen.getByRole("checkbox", { name: "Keep going automatically" });
  expect(box).toHaveFocus();
  expect(scrolled).toHaveBeenCalledWith({ block: "center" });
  expect(scrolled.mock.contexts[0]).toBe(box.closest('[data-slot="settings-row"]'));
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
  await openSettings(
    {
      app_info: () => {
        throw new Error("no");
      },
    },
    "About",
  );
  expect(screen.getByText("Orasenda version unavailable")).toBeInTheDocument();
});

test("about_line_waits_for_app_info", async () => {
  const info = deferred<unknown>();
  mockBackend({ app_info: () => info.promise });
  render(<App />);
  await settle();
  fireEvent.click(screen.getByRole("button", { name: "Settings" }));
  await settle();
  await openPane("About");
  expect(screen.queryByText(/^Orasenda \d/)).toBeNull();
  info.resolve({ name: "Orasenda", version: "0.1.0", os: "macos", arch: "aarch64" });
  await settle();
  expect(screen.getByText("Orasenda 0.1.0 for macOS")).toBeInTheDocument();
  expect(
    screen.getByText("Your data stays on this Mac. Orasenda doesn't use the network."),
  ).toBeInTheDocument();
});

test("load_failure_says_so", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  await openSettings({ settings_get: () => Promise.reject(new Error("nope")) });
  expect(saveLine()).toHaveTextContent("Orasenda can't read settings right now.");
});

// ---- Compact windows ----

async function openCompactSettings() {
  Object.assign(window, { innerWidth: 360, innerHeight: 240 });
  const backend = mockBackend();
  render(<App />);
  await settle();
  fireEvent.keyDown(document.body, { key: "6", metaKey: true });
  await settle();
  return backend;
}

test("compact_settings_shows_pages_and_the_tab_strip", async () => {
  await openCompactSettings();
  expect(screen.getByRole("button", { name: "Pages" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Jump to section" })).toBeNull();
  const nav = screen.getByRole("navigation", { name: "Settings" });
  expect(nav).toHaveAttribute("data-orientation", "horizontal");
  expect(within(nav).getAllByRole("button", { name: /^[A-Z]/ }).length).toBeGreaterThanOrEqual(7);
  expect(h1()).toHaveFocus();
  expect(h1()).toHaveClass("sr-only");
});

test("wide_settings_keeps_the_side_list_and_has_no_pages_button", async () => {
  await openSettings();
  const nav = screen.getByRole("navigation", { name: "Settings" });
  expect(nav).toHaveAttribute("data-orientation", "vertical");
  expect(screen.queryByRole("button", { name: "Pages" })).toBeNull();
});
