import type { NotificationStatus } from "@shared/ipc/bindings";
import { resetSettingsQueueForTests } from "@shared/ipc/settingsQueue";
import { resetTimerQueueForTests } from "@shared/ipc/timerQueue";
import type { Replies } from "@shared/test/fixtures";
import { argsOf, SETTINGS, settle } from "@shared/test/fixtures";
import { clearMocks } from "@tauri-apps/api/mocks";
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { resetNotificationsToggleForTests } from "./notificationsToggle";
import { openSettings, view } from "./Settings.support";

// Settings › Notifications › "When a routine is due" (spec 2026-11-14, §Settings ›
// Notifications): off by default, the same permission flow and denied line as "Tell me when a
// session ends".

const NAME = "When a routine is due";
const openIn = (replies: Replies = {}) => openSettings(replies, "Notifications");

function reset() {
  resetTimerQueueForTests();
  resetSettingsQueueForTests();
  resetNotificationsToggleForTests();
}

beforeEach(reset);

afterEach(async () => {
  cleanup();
  await settle();
  resetSettingsQueueForTests();
  clearMocks();
  vi.restoreAllMocks();
});

const saved = (calls: Parameters<typeof argsOf>[0]) =>
  argsOf(calls, "settings_set") as { settings: typeof SETTINGS }[];

test("routine_due_row_is_off_by_default_in_its_own_row", async () => {
  await openIn({ timer_state: view({ notifications: "granted" }) });
  const row = screen.getByRole("group", { name: "Routines" });
  const box = within(row).getByRole("checkbox", { name: NAME });
  expect(box).not.toBeChecked();
  expect(box).toHaveAttribute("aria-describedby", "notifications-routines-help");
  expect(row).toHaveTextContent(
    "One notification when a routine's time comes, unless you've already started",
  );
});

const LINES: Array<[NotificationStatus, boolean, string | null]> = [
  ["notDetermined", false, "Turning this on asks macOS for permission, once."],
  ["notDetermined", true, "On here, but macOS hasn't been asked yet."],
  ["granted", true, "On. A notification appears once when a routine's time comes."],
  ["granted", false, null],
  ["denied", false, "macOS has notifications off for Orasenda."],
  ["denied", true, "On here, but macOS has notifications off for Orasenda."],
  ["unavailable", true, "Notifications aren't available in this build."],
];

test("routine_due_line_per_status_and_preference", async () => {
  for (const [notifications, pref, line] of LINES) {
    await openIn({
      timer_state: view({ notifications }),
      settings_get: () => ({ ...SETTINGS, notifyRoutineDue: pref }),
    });
    const box = screen.getByRole("checkbox", { name: NAME }) as HTMLInputElement;
    expect(box.checked, `${notifications} ${pref}`).toBe(pref);
    expect(box.disabled).toBe(notifications === "unavailable");
    const status = document.getElementById("notifications-routines-status");
    if (line) {
      expect(status).toHaveTextContent(line);
      expect(box.getAttribute("aria-describedby")).toBe(
        "notifications-routines-status notifications-routines-help",
      );
    } else {
      expect(status).toBeNull();
    }
    expect(line ?? "").not.toMatch(/[!]|missed|broken|failed/);
    // One "Open System Settings" action on the page: the session row's.
    expect(screen.queryAllByRole("button", { name: /Open System Settings/ }).length).toBeLessThan(
      2,
    );
    cleanup();
    await settle();
    clearMocks();
    reset();
  }
});

test("routine_due_asks_macos_when_not_determined_and_saves_on_grant", async () => {
  const { backend } = await openIn({
    timer_state: view({ notifications: "notDetermined" }),
    settings_get: () => ({ ...SETTINGS, notifySessionEnd: false }),
    notifications_request: () => Promise.resolve("granted"),
  });
  fireEvent.click(screen.getByRole("checkbox", { name: NAME }));
  await settle();
  expect(argsOf(backend.calls, "notifications_request")).toHaveLength(1);
  const last = saved(backend.calls).at(-1)?.settings;
  expect(last?.notifyRoutineDue).toBe(true);
  // The other boxes are the person's own choices.
  expect(last?.notifySessionEnd).toBe(false);
  expect(last?.notifyTwoMinutes).toBe(false);
});

test("routine_due_declined_in_macos_saves_nothing", async () => {
  const { backend } = await openIn({
    timer_state: view({ notifications: "notDetermined" }),
    notifications_request: () => Promise.resolve("denied"),
  });
  fireEvent.click(screen.getByRole("checkbox", { name: NAME }));
  await settle();
  expect(saved(backend.calls).some((call) => call.settings.notifyRoutineDue)).toBe(false);
});

test("routine_due_saves_directly_when_granted_and_unticks", async () => {
  const { backend } = await openIn({
    timer_state: view({ notifications: "granted" }),
    settings_get: () => ({ ...SETTINGS, notifyRoutineDue: true }),
  });
  const box = screen.getByRole("checkbox", { name: NAME });
  expect(box).toBeChecked();
  fireEvent.click(box);
  await settle();
  expect(argsOf(backend.calls, "notifications_request")).toHaveLength(0);
  expect(saved(backend.calls).at(-1)?.settings.notifyRoutineDue).toBe(false);
});

test("routine_due_failed_save_says_so_beside_the_row", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  await openIn({
    timer_state: view({ notifications: "granted" }),
    settings_set: () => Promise.reject({ kind: "write", message: "x" }),
  });
  fireEvent.click(screen.getByRole("checkbox", { name: NAME }));
  await settle();
  expect(screen.getByRole("checkbox", { name: NAME })).not.toBeChecked();
  expect(document.getElementById("notifications-routines-status")).toHaveTextContent(
    "Orasenda can't write its data file.",
  );
});

test("routine_due_on_but_not_asked_offers_ask_macos_on_the_session_row", async () => {
  const { backend } = await openIn({
    timer_state: view({ notifications: "notDetermined" }),
    settings_get: () => ({ ...SETTINGS, notifySessionEnd: false, notifyRoutineDue: true }),
  });
  fireEvent.click(screen.getByRole("button", { name: "Ask macOS" }));
  await settle();
  expect(argsOf(backend.calls, "notifications_request")).toHaveLength(1);
});

test("routine_due_on_alone_never_says_the_session_row_is_on", async () => {
  await openIn({
    timer_state: view({ notifications: "granted" }),
    settings_get: () => ({
      ...SETTINGS,
      notifySessionEnd: false,
      notifyTwoMinutes: false,
      notifyRoutineDue: true,
    }),
  });
  expect(screen.getByRole("checkbox", { name: "Tell me when a session ends" })).not.toBeChecked();
  expect(document.getElementById("notifications-status")).toBeNull();
  expect(screen.getByRole("checkbox", { name: "Tell me when a session ends" })).toHaveAttribute(
    "aria-describedby",
    "notifications-help",
  );
  expect(document.getElementById("notifications-routines-status")).toHaveTextContent(
    "On. A notification appears once when a routine's time comes.",
  );
});

test("routine_due_on_alone_while_denied_keeps_open_system_settings_on_the_session_row", async () => {
  await openIn({
    timer_state: view({ notifications: "denied" }),
    settings_get: () => ({
      ...SETTINGS,
      notifySessionEnd: false,
      notifyTwoMinutes: false,
      notifyRoutineDue: true,
    }),
  });
  expect(document.getElementById("notifications-status")).toHaveTextContent(
    "macOS has notifications off for Orasenda.",
  );
  expect(document.getElementById("notifications-status")).not.toHaveTextContent("On here");
  expect(screen.getAllByRole("button", { name: /Open System Settings/ })).toHaveLength(1);
});

test("ask_macos_for_routines_alone_marks_only_the_routine_box_busy", async () => {
  let answer: (status: NotificationStatus) => void = () => {};
  await openIn({
    timer_state: view({ notifications: "notDetermined" }),
    settings_get: () => ({ ...SETTINGS, notifySessionEnd: false, notifyRoutineDue: true }),
    notifications_request: () =>
      new Promise<NotificationStatus>((resolve) => {
        answer = resolve;
      }),
  });
  fireEvent.click(screen.getByRole("button", { name: "Ask macOS" }));
  await settle();
  expect(screen.getByRole("checkbox", { name: NAME })).toHaveAttribute("aria-busy", "true");
  expect(screen.getByRole("checkbox", { name: "Tell me when a session ends" })).not.toHaveAttribute(
    "aria-busy",
  );
  expect(document.getElementById("notifications-routines-status")).toHaveTextContent(
    "Waiting for your answer in the macOS prompt.",
  );
  expect(document.getElementById("notifications-status")).not.toHaveTextContent(
    "Waiting for your answer",
  );
  answer("granted");
  await settle();
});
