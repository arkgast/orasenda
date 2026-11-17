import { resetSettingsQueueForTests } from "@shared/ipc/settingsQueue";
import { resetTimerQueueForTests } from "@shared/ipc/timerQueue";
import type { Replies } from "@shared/test/fixtures";
import { argsOf, SETTINGS, settle } from "@shared/test/fixtures";
import { clearMocks } from "@tauri-apps/api/mocks";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { resetNotificationsToggleForTests } from "./notificationsToggle";
import { openSettings, view } from "./Settings.support";

// Settings rows for the reviews (spec 2026-11-16-reviews, "Settings"; ruling G2).

const granted = view({ notifications: "granted" });
const openIn = (pane: string, replies: Replies = {}) =>
  openSettings({ timer_state: granted, ...replies }, pane);
const withSettings = (patch: Partial<typeof SETTINGS>) => ({
  settings_get: () => ({ ...SETTINGS, ...patch }),
});

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
});

const saved = (calls: Parameters<typeof argsOf>[0]) =>
  argsOf(calls, "settings_set") as { settings: typeof SETTINGS }[];
const time = () => screen.queryByLabelText("Time of day") as HTMLInputElement | null;
const shutdown = () => screen.getByRole("checkbox", { name: "When it's time to close the day" });
const weekly = () => screen.getByRole("checkbox", { name: "When it's time for the weekly review" });

test("goal_stepper_no_goal_at_zero", async () => {
  const { backend } = await openIn("Timer");
  const goal = screen.getByRole("spinbutton", { name: "Weekly focus goal" });
  expect(goal).toHaveAttribute("aria-valuetext", "No goal");
  expect(goal).toHaveAttribute("aria-valuemin", "0");
  expect(goal).toHaveAttribute("aria-valuemax", "60");
  fireEvent.click(screen.getByRole("button", { name: "Increase Weekly focus goal" }));
  await settle();
  expect(saved(backend.calls).at(-1)?.settings.reviewFocusGoalHours).toBe(1);
  expect(screen.getByRole("spinbutton", { name: "Weekly focus goal" })).toHaveAttribute(
    "aria-valuetext",
    "1 hour",
  );
});

test("both_nudges_are_off_by_default_and_hide_their_controls", async () => {
  await openIn("Notifications");
  expect(shutdown()).not.toBeChecked();
  expect(weekly()).not.toBeChecked();
  expect(time()).toBeNull();
  expect(screen.queryByLabelText("Weekly review day")).toBeNull();
});

test("review_time_shown_while_either_on", async () => {
  await openIn("Notifications", withSettings({ notifyShutdownDue: true }));
  expect(time()?.value).toBe("17:30");
  expect(screen.queryByLabelText("Weekly review day")).toBeNull();
  cleanup();
  await settle();
  resetSettingsQueueForTests();
  await openIn("Notifications", withSettings({ notifyWeeklyReview: true }));
  expect(time()?.value).toBe("17:30");
});

test("review_time_bounded_0400_2359", async () => {
  const { backend } = await openIn("Notifications", withSettings({ notifyShutdownDue: true }));
  const input = time() as HTMLInputElement;
  expect(input).toHaveAttribute("type", "time");
  expect(input).toHaveAttribute("min", "04:00");
  expect(input).toHaveAttribute("max", "23:59");
  const before = saved(backend.calls).length;
  fireEvent.change(input, { target: { value: "03:30" } });
  fireEvent.blur(input);
  await settle();
  expect(saved(backend.calls)).toHaveLength(before);
  expect(time()?.value).toBe("17:30");
  fireEvent.change(time() as HTMLInputElement, { target: { value: "08:15" } });
  fireEvent.blur(time() as HTMLInputElement);
  await settle();
  expect(saved(backend.calls).at(-1)?.settings.reviewShutdownTime).toBe(495);
});

test("stored_time_out_of_range_shows_the_default", async () => {
  await openIn("Notifications", withSettings({ notifyShutdownDue: true, reviewShutdownTime: 100 }));
  expect(time()?.value).toBe("17:30");
});

test("weekly_day_shown_while_weekly_on", async () => {
  const { backend } = await openIn("Notifications", withSettings({ notifyWeeklyReview: true }));
  const day = screen.getByLabelText("Weekly review day") as HTMLSelectElement;
  expect([...day.options].map((o) => o.text)).toEqual(["Friday", "Saturday", "Sunday", "Monday"]);
  fireEvent.change(day, { target: { value: "sun" } });
  await settle();
  expect(saved(backend.calls).at(-1)?.settings.reviewWeeklyDay).toBe("sun");
});

test("nudge_switches_use_the_same_permission_gate", async () => {
  const { backend } = await openIn("Notifications", {
    timer_state: view({ notifications: "notDetermined" }),
    ...withSettings({ notifySessionEnd: false }),
    notifications_request: () => Promise.resolve("granted"),
  });
  fireEvent.click(shutdown());
  await settle();
  expect(argsOf(backend.calls, "notifications_request")).toHaveLength(1);
  const last = saved(backend.calls).at(-1)?.settings;
  expect(last?.notifyShutdownDue).toBe(true);
  expect(last?.notifyWeeklyReview).toBe(false);
  expect(last?.notifySessionEnd).toBe(false);
});

test("nudge_switch_saves_directly_when_granted", async () => {
  const { backend } = await openIn("Notifications");
  fireEvent.click(weekly());
  await settle();
  expect(argsOf(backend.calls, "notifications_request")).toHaveLength(0);
  expect(saved(backend.calls).at(-1)?.settings.notifyWeeklyReview).toBe(true);
});
