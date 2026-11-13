import { App } from "@app/App";
import { resetSettingsQueueForTests } from "@shared/ipc/settingsQueue";
import { resetTimerQueueForTests } from "@shared/ipc/timerQueue";
import {
  argsOf,
  DEEP,
  deferred,
  emitNavigate,
  mockBackend,
  SETTINGS,
  settle,
} from "@shared/test/fixtures";
import { clearMocks } from "@tauri-apps/api/mocks";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { resetNotificationsToggleForTests } from "./notificationsToggle";
import { h1, INVALID, openSettings, saveLine, WRITE } from "./Settings.support";

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

test("field_target_lands_on_the_timer_section", async () => {
  // C's "Open Settings" calls navigate(page, target); drive the page through its arrival prop.
  const { Settings: Page } = await import("./Settings");
  mockBackend();
  const { rerender } = render(
    <Page
      info={{ status: "loading" }}
      arrival={{ seq: 1, target: "focusMinutes" }}
      onNavigate={() => {}}
    />,
  );
  await settle();
  expect(screen.getByRole("heading", { level: 2, name: "Timer" })).toHaveFocus();
  rerender(
    <Page
      info={{ status: "loading" }}
      arrival={{ seq: 2, target: "notifications" }}
      onNavigate={() => {}}
    />,
  );
  await settle();
  expect(screen.getByRole("heading", { level: 2, name: "Notifications" })).toHaveFocus();
  rerender(
    <Page
      info={{ status: "loading" }}
      arrival={{ seq: 3, target: "timer" }}
      onNavigate={() => {}}
    />,
  );
  await settle();
  expect(screen.getByRole("heading", { level: 2, name: "Timer" })).toHaveFocus();
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
  await openSettings({ settings_get: () => ({ ...SETTINGS, theme: "dark", presetId: DEEP }) });
  const nav = within(screen.getByRole("navigation", { name: "Settings sections" }));
  expect(nav.getByText("Dark")).toBeInTheDocument();
  expect(nav.getByText("Deep Work")).toBeInTheDocument();
  expect(nav.getByText("On")).toBeInTheDocument();
  expect(nav.getByText("Nothing recorded")).toBeInTheDocument();
  expect(nav.getByText("Version 0.1.0")).toBeInTheDocument();

  fireEvent.keyDown(nav.getByRole("button", { name: /^Timer/ }), { key: "Enter" });
  expect(screen.getByRole("heading", { level: 2, name: "Timer" })).toHaveFocus();
});

test("index_says_not_saved_after_a_write_failure", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  await openSettings({ settings_set: () => Promise.reject(WRITE) });
  fireEvent.click(screen.getByRole("radio", { name: "Dark" }));
  await settle();
  const nav = within(screen.getByRole("navigation", { name: "Settings sections" }));
  expect(nav.getByText("Not saved")).toBeInTheDocument();
});

test("load_failure_says_so", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  await openSettings({ settings_get: () => Promise.reject(new Error("nope")) });
  expect(saveLine()).toHaveTextContent("Orasenda can't read settings right now.");
});

// ---- Compact windows ----

const SECTION_NAMES = [
  "General",
  "Timer",
  "Notifications",
  "Keyboard",
  "Apps and sites",
  "About and data",
];

type MenuRequest = {
  items: Array<{ id: string; label: string; checked?: boolean }>;
  x: number;
  y: number;
};

async function openCompactSettings(answer: string | null) {
  Object.assign(window, { innerWidth: 360, innerHeight: 240 });
  const backend = mockBackend({ native_menu_popup: () => answer });
  render(<App />);
  await settle();
  fireEvent.keyDown(document.body, { key: "6", metaKey: true });
  await settle();
  return backend;
}

function menuRequests(backend: { calls: { cmd: string; args: unknown }[] }): MenuRequest[] {
  return (argsOf(backend.calls, "native_menu_popup") as { request: MenuRequest }[]).map(
    (call) => call.request,
  );
}

test("compact_settings_shows_pages_and_jump", async () => {
  await openCompactSettings(null);
  expect(screen.getByRole("button", { name: "Pages" })).toBeInTheDocument();
  const jump = screen.getByRole("button", { name: "Jump to section" });
  expect(
    screen.getByRole("button", { name: "Pages" }).compareDocumentPosition(jump) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(jump).toHaveAttribute("aria-haspopup", "menu");
  expect(jump).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByRole("navigation", { name: "Settings sections" })).toBeNull();
  expect(h1()).toHaveFocus();
  expect(h1()).toHaveClass("sr-only");
});

test("wide_settings_keeps_the_index_and_has_no_jump_button", async () => {
  await openSettings();
  expect(screen.getByRole("navigation", { name: "Settings sections" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Jump to section" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Pages" })).toBeNull();
});

test("jump_menu_lists_sections_current_checked", async () => {
  const backend = await openCompactSettings(null);
  fireEvent.click(screen.getByRole("button", { name: "Jump to section" }));
  await settle();
  const [request] = menuRequests(backend);
  expect(request?.items.map((item) => item.label)).toEqual(SECTION_NAMES);
  expect(request?.items.map((item) => item.checked)).toEqual([
    true,
    false,
    false,
    false,
    false,
    false,
  ]);
});

test("jump_choice_focuses_section_heading", async () => {
  await openCompactSettings("notifications");
  fireEvent.click(screen.getByRole("button", { name: "Jump to section" }));
  await settle();
  expect(screen.getByRole("heading", { level: 2, name: "Notifications" })).toHaveFocus();
  expect(screen.getByRole("button", { name: "Jump to section" })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
});

test("jump_dismissed_does_nothing", async () => {
  await openCompactSettings(null);
  const before = document.activeElement;
  fireEvent.click(screen.getByRole("button", { name: "Jump to section" }));
  await settle();
  expect(document.activeElement).toBe(before);
});
