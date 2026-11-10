import { clearMocks } from "@tauri-apps/api/mocks";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { App } from "../App";
import type { NavigatePage, NotificationStatus, Settings, TimerView_Serialize } from "../bindings";
import { resetNotificationsToggleForTests } from "../notificationsToggle";
import { resetSettingsQueueForTests } from "../settingsQueue";
import { resetTimerQueueForTests } from "../timerQueue";
import {
  argsOf,
  deferred,
  emitNavigate,
  emitSettingsChanged,
  emitTimer,
  IDLE,
  mockBackend,
  PAUSED,
  type Replies,
  RUNNING,
  SETTINGS,
  settle,
} from "./testing";

const WRITE = { kind: "write", message: "disk full" };
const INVALID = { kind: "invalidSpec", message: "focus_min out of range" };
const WRITE_REASON = "Orasenda can't write its data file.";
const REST = "Changes save as you make them.";

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

function view(patch: Partial<TimerView_Serialize>) {
  return () => ({ view: { ...IDLE, ...patch }, pending: [] });
}

async function openSettings(replies: Replies = {}) {
  const backend = mockBackend(replies);
  const result = render(<App />);
  await settle();
  fireEvent.click(screen.getByRole("button", { name: "Settings" }));
  await settle();
  return { backend, ...result };
}

const h1 = () => screen.getByRole("heading", { level: 1, name: "Settings" });
const focusInput = () => screen.getByLabelText("Focus minutes") as HTMLInputElement;
const breakInput = () => screen.getByLabelText("Break minutes") as HTMLInputElement;
const statusNodes = () => screen.queryAllByRole("status");
const saveLine = () => statusNodes()[0] as HTMLElement;
const sets = (backend: { calls: { cmd: string; args: unknown }[] }) =>
  argsOf(backend.calls, "settings_set") as { settings: Settings }[];

async function type(input: HTMLInputElement, value: string) {
  fireEvent.change(input, { target: { value } });
  await settle();
}

async function blur(input: HTMLInputElement) {
  input.focus();
  fireEvent.blur(input);
  await settle();
}

// ---- Navigation and arrival ----

test("rail_cmd_comma_and_tray_land_on_settings_with_h1_focus", async () => {
  const { container } = await openSettings();
  expect(h1()).toHaveFocus();
  expect(container.querySelectorAll("h1")).toHaveLength(1);
  expect(container.querySelectorAll(".os-btn-primary")).toHaveLength(0);

  fireEvent.click(screen.getByRole("button", { name: "Today" }));
  await settle();
  for (const taken of ["settings", null] as Array<NavigatePage | null>) {
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
  mockBackend({ navigate_take: () => "settings" });
  render(<App />);
  await settle();
  expect(h1()).toHaveFocus();
});

test("navigate_event_and_take_land_once", async () => {
  const focused = vi.spyOn(HTMLElement.prototype, "focus");
  const backend = mockBackend({ navigate_take: () => "settings" });
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

// ---- Timer ----

test("minute_field_saves_on_blur_and_return", async () => {
  const { backend } = await openSettings();
  await type(focusInput(), "50");
  expect(sets(backend)).toHaveLength(0);
  await blur(focusInput());
  expect(sets(backend)).toEqual([
    { settings: { ...SETTINGS, custom: { focusMin: 50, breakMin: 10 } } },
  ]);
  expect(sets(backend)[0]?.settings.preset).toBe("classic");
  expect(saveLine()).toHaveTextContent("Saved. Custom focus is now 50 minutes.");

  await type(breakInput(), "15");
  fireEvent.keyDown(breakInput(), { key: "Enter" });
  await settle();
  expect(sets(backend)).toHaveLength(2);
  expect(saveLine()).toHaveTextContent("Saved. Custom break is now 15 minutes.");
});

test("esc_restores_saved_value_and_clears_error", async () => {
  await openSettings();
  await type(focusInput(), "abc");
  await type(focusInput(), "");
  await blur(focusInput());
  expect(focusInput()).toHaveAttribute("aria-invalid", "true");
  fireEvent.keyDown(focusInput(), { key: "Escape" });
  await settle();
  expect(focusInput()).toHaveValue(45);
  expect(focusInput()).not.toHaveAttribute("aria-invalid", "true");
  expect(saveLine()).toHaveTextContent(REST);
});

test("non_number_refused_locally_without_ipc", async () => {
  const { backend } = await openSettings();
  await type(focusInput(), "");
  await blur(focusInput());
  expect(sets(backend)).toHaveLength(0);
  expect(screen.getByText("Between 5 and 180 minutes. Still using 45.")).toBeInTheDocument();
  expect(saveLine()).toHaveTextContent("Focus minutes weren't saved. Still using 45.");
});

test("invalid_spec_shows_field_error_and_save_line_with_show", async () => {
  const { backend } = await openSettings({ settings_set: () => Promise.reject(INVALID) });
  await type(focusInput(), "3");
  await blur(focusInput());
  expect(sets(backend)).toHaveLength(1);
  expect(focusInput()).toHaveValue(3);
  expect(focusInput()).toHaveAttribute("aria-invalid", "true");
  expect(screen.getByText("Between 5 and 180 minutes. Still using 45.")).toBeInTheDocument();
  expect(
    statusNodes().some((n) => n.textContent === "Focus minutes weren't saved. Still using 45."),
  ).toBe(true);
  breakInput().focus();
  fireEvent.click(screen.getByRole("button", { name: "Show focus minutes" }));
  expect(focusInput()).toHaveFocus();
});

test("both_fields_invalid_show_both_errors", async () => {
  await openSettings({ settings_set: () => Promise.reject(INVALID) });
  await type(focusInput(), "3");
  await type(breakInput(), "70");
  await blur(breakInput());
  expect(screen.getByText("Between 5 and 180 minutes. Still using 45.")).toBeInTheDocument();
  expect(screen.getByText("Between 1 and 60 minutes. Still using 10.")).toBeInTheDocument();
  expect(
    statusNodes().some(
      (n) => n.textContent === "Focus and break minutes weren't saved. Still using 45 and 10.",
    ),
  ).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Show focus minutes" }));
  expect(focusInput()).toHaveFocus();
});

test("fields_show_under_every_preset", async () => {
  for (const preset of ["classic", "fifty_ten", "deep_block", "custom"] as const) {
    await openSettings({ settings_get: () => ({ ...SETTINGS, preset }) });
    expect(focusInput()).toBeInTheDocument();
    expect(breakInput()).toBeInTheDocument();
    expect(screen.getByText("Between 5 and 180 minutes.")).toBeInTheDocument();
    expect(screen.getByText("Between 1 and 60 minutes.")).toBeInTheDocument();
    cleanup();
    await settle();
    clearMocks();
    resetSettingsQueueForTests();
  }
});

test("running_session_line_only_while_not_idle", async () => {
  await openSettings();
  const line = "A session is running. Changes apply to your next session.";
  expect(screen.queryByText(line)).toBeNull();
  await emitTimer(RUNNING);
  expect(screen.getByText(line)).toBeInTheDocument();
  await emitTimer(PAUSED);
  expect(screen.getByText(line)).toBeInTheDocument();
  await emitTimer(IDLE);
  expect(screen.queryByText(line)).toBeNull();
});

// ---- Save line ----

test("saved_line_only_for_minute_fields", async () => {
  await openSettings();
  fireEvent.click(screen.getByRole("radio", { name: "Dark" }));
  await settle();
  expect(saveLine()).toHaveTextContent(REST);
  fireEvent.click(screen.getByRole("radio", { name: "50/10" }));
  await settle();
  expect(saveLine()).toHaveTextContent(REST);
  await type(focusInput(), "60");
  await blur(focusInput());
  expect(saveLine()).toHaveTextContent("Saved. Custom focus is now 60 minutes.");
  fireEvent.click(screen.getByRole("radio", { name: "Light" }));
  await settle();
  expect(saveLine()).toHaveTextContent(REST);
});

test("exactly_one_status_node_at_every_step", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const fail = { on: false };
  await openSettings({ settings_set: () => (fail.on ? Promise.reject(WRITE) : null) });
  expect(statusNodes(), "rest").toHaveLength(1);
  await type(focusInput(), "50");
  await blur(focusInput());
  expect(statusNodes(), "saved").toHaveLength(1);
  await type(focusInput(), "");
  await blur(focusInput());
  expect(statusNodes(), "invalid value").toHaveLength(1);
  expect(focusInput()).toHaveAttribute("aria-invalid", "true");
  const described = focusInput().getAttribute("aria-describedby") ?? "";
  const errorNode = described
    .split(" ")
    .map((id) => document.getElementById(id))
    .find((n) => n?.textContent?.includes("Between 5 and 180 minutes. Still using 50."));
  expect(errorNode, "aria-describedby names the error paragraph").toBeTruthy();
  fireEvent.keyDown(focusInput(), { key: "Escape" });
  fail.on = true;
  fireEvent.click(screen.getByRole("radio", { name: "Dark" }));
  await settle();
  expect(statusNodes(), "write failure").toHaveLength(1);
  await emitTimer({ ...IDLE, store: "unavailable" });
  expect(statusNodes(), "unavailable").toHaveLength(1);
  await emitTimer({ ...IDLE, store: "newer" });
  expect(statusNodes(), "newer").toHaveLength(1);
});

test("write_failure_rolls_back_and_try_again_resends", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  let fail = true;
  const { backend } = await openSettings({
    settings_set: () => (fail ? Promise.reject(WRITE) : null),
  });
  fireEvent.click(screen.getByRole("radio", { name: "Dark" }));
  await settle();
  expect(screen.getByRole("radio", { name: "Match system" })).toBeChecked();
  expect(screen.getByText(WRITE_REASON)).toBeInTheDocument();
  expect(saveLine()).toHaveTextContent("Theme wasn't saved. Back to Match system.");
  expect(document.documentElement.dataset.theme).toBeUndefined();

  fail = false;
  fireEvent.click(screen.getByRole("button", { name: "Try again saving theme" }));
  await settle();
  expect(sets(backend)).toHaveLength(2);
  expect(sets(backend)[1]?.settings.theme).toBe("dark");
});

test("multi_change_failure_shows_general_line", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const reload = deferred<Settings>();
  let gets = 0;
  const { backend } = await openSettings({
    settings_get: () => (++gets === 1 ? SETTINGS : reload.promise),
    settings_set: () => Promise.reject(WRITE),
  });
  // A reload is in flight, so both changes go out in one save.
  await emitSettingsChanged(SETTINGS);
  fireEvent.click(screen.getByRole("radio", { name: "Dark" }));
  fireEvent.click(screen.getByRole("radio", { name: "50/10" }));
  reload.resolve(SETTINGS);
  await settle();
  expect(sets(backend)).toHaveLength(1);
  expect(saveLine()).toHaveTextContent(
    "Your last changes weren't saved. Settings are back to what was saved.",
  );
  expect(screen.getAllByText(WRITE_REASON).length).toBe(2);
  expect(screen.getByRole("button", { name: "Try again saving your changes" })).toBeInTheDocument();
});

test("store_unavailable_shows_standing_line", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  await openSettings({ timer_state: view({ store: "unavailable" }) });
  const standing = "Orasenda can't save settings right now. Changes you make here may not be kept.";
  expect(saveLine()).toHaveTextContent(standing);
  expect(screen.queryByRole("button", { name: "Try again saving" })).toBeNull();
});

test("store_unavailable_failure_offers_try_again", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const UNAVAILABLE = { kind: "unavailable", message: "no store" };
  let fail = true;
  const { backend } = await openSettings({
    timer_state: view({ store: "unavailable" }),
    settings_set: () => (fail ? Promise.reject(UNAVAILABLE) : null),
  });
  fireEvent.click(screen.getByRole("radio", { name: "Dark" }));
  await settle();
  expect(saveLine()).toHaveTextContent(
    "Orasenda can't save settings right now. Changes you make here may not be kept.",
  );
  fail = false;
  fireEvent.click(screen.getByRole("button", { name: "Try again saving" }));
  await settle();
  expect(sets(backend)).toHaveLength(2);
  expect(sets(backend)[1]?.settings.theme).toBe("dark");
});

test("store_newer_disables_every_control", async () => {
  const { container } = await openSettings({ timer_state: view({ store: "newer" }) });
  for (const control of container.querySelectorAll("input")) expect(control).toBeDisabled();
  expect(screen.getAllByText("Read-only until you update Orasenda.").length).toBeGreaterThanOrEqual(
    4,
  );
  expect(saveLine()).toHaveTextContent(
    "This data was saved by a newer Orasenda. Settings are read-only until you update.",
  );
});

// ---- Notifications ----

const TABLE: Array<[NotificationStatus, boolean, string | null, string, boolean]> = [
  ["notDetermined", false, "Turning this on asks macOS for permission, once.", "Off", false],
  ["notDetermined", true, "On here, but macOS hasn't been asked yet.", "Not asked yet", true],
  [
    "granted",
    true,
    "On. A notification appears when a session ends while Orasenda is in the background.",
    "On",
    true,
  ],
  ["granted", false, null, "Off", false],
  ["denied", false, "macOS has notifications off for Orasenda.", "Off in macOS", false],
  [
    "denied",
    true,
    "On here, but macOS has notifications off for Orasenda. Allow them in System Settings and Orasenda will use them.",
    "Off in macOS",
    true,
  ],
  ["unavailable", true, "Notifications aren't available in this build.", "Not available", true],
];

test("notifications_row_per_status_and_preference", async () => {
  for (const [notifications, pref, line, value, checked] of TABLE) {
    await openSettings({
      timer_state: view({ notifications }),
      settings_get: () => ({ ...SETTINGS, notifySessionEnd: pref }),
    });
    const box = screen.getByRole("checkbox", { name: "Tell me when a session ends" });
    expect((box as HTMLInputElement).checked, `${notifications} ${pref}`).toBe(checked);
    expect(box).toHaveProperty("disabled", notifications === "unavailable");
    expect(box.getAttribute("aria-describedby")).toBe(
      line ? "notifications-status notifications-help" : "notifications-help",
    );
    if (line) expect(document.getElementById("notifications-status")).toHaveTextContent(line);
    const nav = within(screen.getByRole("navigation", { name: "Settings sections" }));
    expect(nav.getByText(value)).toBeInTheDocument();
    cleanup();
    await settle();
    clearMocks();
    resetSettingsQueueForTests();
    resetTimerQueueForTests();
  }
});

test("asking_shows_busy_and_waiting_line", async () => {
  const request = deferred<NotificationStatus>();
  await openSettings({
    timer_state: view({ notifications: "notDetermined" }),
    settings_get: () => ({ ...SETTINGS, notifySessionEnd: false }),
    notifications_request: () => request.promise,
  });
  const box = screen.getByRole("checkbox", { name: "Tell me when a session ends" });
  fireEvent.click(box);
  await settle();
  expect(box).toBeChecked();
  expect(box).toHaveAttribute("aria-busy", "true");
  expect(document.getElementById("notifications-status")).toHaveTextContent(
    "Waiting for your answer in the macOS prompt.",
  );
  fireEvent.click(box);
  await settle();
  expect(box).not.toBeChecked();
  request.resolve("granted");
  await settle();
  expect(box).not.toBeChecked();
});

test("ask_macos_only_in_not_determined_on", async () => {
  const { backend } = await openSettings({
    timer_state: view({ notifications: "notDetermined" }),
  });
  fireEvent.click(screen.getByRole("button", { name: "Ask macOS" }));
  await settle();
  expect(argsOf(backend.calls, "notifications_request")).toHaveLength(1);
  for (const [status, pref] of [
    ["granted", true],
    ["denied", true],
    ["notDetermined", false],
  ] as const) {
    cleanup();
    await settle();
    clearMocks();
    resetSettingsQueueForTests();
    resetTimerQueueForTests();
    await openSettings({
      timer_state: view({ notifications: status }),
      settings_get: () => ({ ...SETTINGS, notifySessionEnd: pref }),
    });
    expect(screen.queryByRole("button", { name: "Ask macOS" })).toBeNull();
  }
});

test("open_system_settings_calls_command", async () => {
  for (const pref of [false, true]) {
    const { backend } = await openSettings({
      timer_state: view({ notifications: "denied" }),
      settings_get: () => ({ ...SETTINGS, notifySessionEnd: pref }),
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Open System Settings, Notifications for Orasenda" }),
    );
    await settle();
    expect(argsOf(backend.calls, "notifications_open_settings")).toHaveLength(1);
    cleanup();
    await settle();
    clearMocks();
    resetSettingsQueueForTests();
    resetTimerQueueForTests();
  }
});

test("open_settings_failure_adds_find_line", async () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  await openSettings({
    timer_state: view({ notifications: "denied" }),
    notifications_open_settings: () => Promise.reject({ kind: "failed", message: "x" }),
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Open System Settings, Notifications for Orasenda" }),
  );
  await settle();
  expect(document.getElementById("notifications-status")).toHaveTextContent(
    "Find Orasenda in System Settings, Notifications.",
  );
  expect(error).toHaveBeenCalled();
});

test("settings_changed_keeps_unsaved_field_draft", async () => {
  const { backend } = await openSettings();
  await type(focusInput(), "77");
  await emitSettingsChanged({ ...SETTINGS, theme: "dark" });
  const gets = argsOf(backend.calls, "settings_get").length;
  expect(gets).toBeGreaterThanOrEqual(2);
  expect(focusInput()).toHaveValue(77);
});
