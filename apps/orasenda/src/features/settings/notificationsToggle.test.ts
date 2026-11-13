import type { NotificationStatus } from "@shared/ipc/bindings";
import { load, register, resetSettingsQueueForTests } from "@shared/ipc/settingsQueue";
import { argsOf, deferred, mockBackend, SETTINGS, settle } from "@shared/test/fixtures";
import { clearMocks } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  askMacOS,
  isAsking,
  resetNotificationsToggleForTests,
  tick,
  untick,
} from "./notificationsToggle";

const OFF = { ...SETTINGS, notifySessionEnd: false };

beforeEach(async () => {
  resetSettingsQueueForTests();
  resetNotificationsToggleForTests();
});

afterEach(async () => {
  await settle();
  resetSettingsQueueForTests();
  clearMocks();
  vi.restoreAllMocks();
});

async function ready(replies: Parameters<typeof mockBackend>[0]) {
  const backend = mockBackend({ settings_get: () => OFF, ...replies });
  register({
    shown: () => {},
    accepted: () => {},
    loadFailed: () => {},
    saveFailed: () => {},
  });
  load();
  await settle();
  return backend;
}

test("tick_not_determined_granted_saves_true", async () => {
  const request = deferred<NotificationStatus>();
  const backend = await ready({ notifications_request: () => request.promise });
  tick("notDetermined");
  expect(isAsking()).toBe(true);
  expect(argsOf(backend.calls, "notifications_request")).toHaveLength(1);
  request.resolve("granted");
  await settle();
  expect(isAsking()).toBe(false);
  expect(argsOf(backend.calls, "settings_set")).toEqual([
    { settings: { ...OFF, notifySessionEnd: true } },
  ]);
});

test("tick_not_determined_denied_saves_nothing", async () => {
  const backend = await ready({ notifications_request: () => "denied" });
  tick("notDetermined");
  await settle();
  expect(isAsking()).toBe(false);
  expect(argsOf(backend.calls, "settings_set")).toHaveLength(0);
});

test("untick_while_asking_saves_false_and_drops_late_answer", async () => {
  const request = deferred<NotificationStatus>();
  const backend = await ready({
    settings_get: () => ({ ...SETTINGS, notifySessionEnd: true }),
    notifications_request: () => request.promise,
  });
  askMacOS();
  expect(isAsking()).toBe(true);
  untick();
  expect(isAsking()).toBe(false);
  await settle();
  expect(argsOf(backend.calls, "settings_set")).toEqual([{ settings: OFF }]);
  request.resolve("granted");
  await settle();
  expect(isAsking()).toBe(false);
  expect(argsOf(backend.calls, "settings_set")).toHaveLength(1);
});

test("rejected_request_treated_as_unavailable", async () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  const backend = await ready({
    notifications_request: () => {
      throw new Error("no");
    },
  });
  tick("notDetermined");
  await settle();
  expect(isAsking()).toBe(false);
  expect(argsOf(backend.calls, "settings_set")).toHaveLength(0);
  expect(error).toHaveBeenCalled();
});

test("tick_granted_or_denied_saves_true", async () => {
  for (const status of ["granted", "denied"] as const) {
    resetSettingsQueueForTests();
    const backend = await ready({});
    tick(status);
    await settle();
    expect(argsOf(backend.calls, "settings_set")).toEqual([
      { settings: { ...OFF, notifySessionEnd: true } },
    ]);
    clearMocks();
  }
});

test("tick_resolves_per_outcome", async () => {
  const request = deferred<NotificationStatus>();
  await ready({ notifications_request: () => request.promise });
  const result = tick("notDetermined");
  request.resolve("granted");
  await expect(result).resolves.toBe(true);

  resetSettingsQueueForTests();
  resetNotificationsToggleForTests();
  vi.spyOn(console, "error").mockImplementation(() => {});
  await ready({ notifications_request: () => "denied" });
  await expect(tick("notDetermined")).resolves.toBe(true);

  resetSettingsQueueForTests();
  resetNotificationsToggleForTests();
  clearMocks();
  await ready({
    notifications_request: () => {
      throw new Error("no");
    },
  });
  await expect(tick("notDetermined")).resolves.toBe(false);
});

test("granted_with_failed_save_resolves_false", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  await ready({
    notifications_request: () => "granted",
    settings_set: () => Promise.reject({ kind: "write", message: "x" }),
  });
  await expect(tick("notDetermined")).resolves.toBe(false);
});

test("joined_ask_shares_the_result", async () => {
  const request = deferred<NotificationStatus>();
  await ready({ notifications_request: () => request.promise });
  const first = tick("notDetermined");
  const second = tick("notDetermined", "notifyTwoMinutes");
  request.resolve("denied");
  await expect(first).resolves.toBe(true);
  await expect(second).resolves.toBe(true);
});

test("untick_during_ask_resolves_true", async () => {
  const request = deferred<NotificationStatus>();
  await ready({ notifications_request: () => request.promise });
  const asked = tick("notDetermined");
  const off = untick();
  request.resolve("granted");
  await expect(asked).resolves.toBe(true);
  await expect(off).resolves.toBe(true);
});
