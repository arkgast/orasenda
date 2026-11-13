import type { NotificationStatus } from "@shared/ipc/bindings";
import { resetSettingsQueueForTests } from "@shared/ipc/settingsQueue";
import { resetTimerQueueForTests } from "@shared/ipc/timerQueue";
import { argsOf, deferred, emitSettingsChanged, SETTINGS, settle } from "@shared/test/fixtures";
import { clearMocks } from "@tauri-apps/api/mocks";
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { resetNotificationsToggleForTests } from "./notificationsToggle";
import { openSettings, view } from "./Settings.support";

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

test("two_minutes_checkbox_asks_when_not_determined", async () => {
  const { backend } = await openSettings({
    timer_state: view({ notifications: "notDetermined" }),
    settings_get: () => ({ ...SETTINGS, notifySessionEnd: false }),
    notifications_request: () => Promise.resolve("granted"),
  });
  const box = screen.getByRole("checkbox", { name: "Two minutes before the end" });
  expect(box).not.toBeChecked();
  fireEvent.click(box);
  await settle();
  expect(argsOf(backend.calls, "notifications_request")).toHaveLength(1);
  const saved = argsOf(backend.calls, "settings_set") as { settings: typeof SETTINGS }[];
  expect(saved.at(-1)?.settings.notifyTwoMinutes).toBe(true);
  // The session-end box is the person's own choice: asking for this one leaves it alone.
  expect(saved.at(-1)?.settings.notifySessionEnd).toBe(false);
  expect(screen.getByText("Only while Orasenda is in the background.")).toBeInTheDocument();
});

test("two_minutes_checkbox_saves_directly_when_granted_and_unticks", async () => {
  const { backend } = await openSettings({
    timer_state: view({ notifications: "granted" }),
    settings_get: () => ({ ...SETTINGS, notifyTwoMinutes: true }),
  });
  const box = screen.getByRole("checkbox", { name: "Two minutes before the end" });
  expect(box).toBeChecked();
  fireEvent.click(box);
  await settle();
  expect(argsOf(backend.calls, "notifications_request")).toHaveLength(0);
  const saved = argsOf(backend.calls, "settings_set") as { settings: typeof SETTINGS }[];
  expect(saved.at(-1)?.settings.notifyTwoMinutes).toBe(false);
});
