import { clearMocks } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { NotificationStatus } from "../../ipc/bindings";
import { load, register, resetSettingsQueueForTests } from "../../ipc/settingsQueue";
import { argsOf, deferred, mockBackend, SETTINGS, settle } from "../../test/fixtures";
import {
  askingKey,
  askMacOS,
  pendingKeys,
  resetNotificationsToggleForTests,
  tick,
  untick,
} from "./notificationsToggle";

const OFF = { ...SETTINGS, notifySessionEnd: false, notifyTwoMinutes: false };

beforeEach(() => {
  resetSettingsQueueForTests();
  resetNotificationsToggleForTests();
});

afterEach(async () => {
  await settle();
  resetSettingsQueueForTests();
  clearMocks();
  vi.restoreAllMocks();
});

async function ready(settings = OFF) {
  const request = deferred<NotificationStatus>();
  const backend = mockBackend({
    settings_get: () => settings,
    notifications_request: () => request.promise,
  });
  register({ shown: () => {}, accepted: () => {}, loadFailed: () => {}, saveFailed: () => {} });
  load();
  await settle();
  return { backend, request };
}

test("tick_a_tick_b_granted", async () => {
  const { backend, request } = await ready();
  tick("notDetermined", "notifySessionEnd");
  tick("notDetermined", "notifyTwoMinutes");
  expect(pendingKeys()).toEqual(["notifySessionEnd", "notifyTwoMinutes"]);
  request.resolve("granted");
  await settle();
  expect(pendingKeys()).toEqual([]);
  expect(argsOf(backend.calls, "settings_set").at(-1)).toEqual({
    settings: { ...OFF, notifySessionEnd: true, notifyTwoMinutes: true },
  });
});

test("tick_a_tick_b_untick_a_granted", async () => {
  const { backend, request } = await ready();
  tick("notDetermined", "notifySessionEnd");
  tick("notDetermined", "notifyTwoMinutes");
  untick("notifySessionEnd");
  expect(pendingKeys()).toEqual(["notifyTwoMinutes"]);
  expect(askingKey()).not.toBe("notifySessionEnd");
  request.resolve("granted");
  await settle();
  expect(askingKey()).toBeNull();
  expect(argsOf(backend.calls, "settings_set").at(-1)).toEqual({
    settings: { ...OFF, notifyTwoMinutes: true },
  });
});

test("tick_during_ask_saved_on_granted", async () => {
  const { backend, request } = await ready({ ...OFF, notifySessionEnd: true });
  askMacOS();
  tick("notDetermined", "notifyTwoMinutes");
  expect(pendingKeys()).toEqual(["notifyTwoMinutes"]);
  request.resolve("granted");
  await settle();
  expect(argsOf(backend.calls, "settings_set")).toEqual([
    { settings: { ...OFF, notifySessionEnd: true, notifyTwoMinutes: true } },
  ]);
});

test("tick_during_ask_undone_on_denied", async () => {
  const { backend, request } = await ready({ ...OFF, notifySessionEnd: true });
  askMacOS();
  tick("notDetermined", "notifyTwoMinutes");
  request.resolve("denied");
  await settle();
  expect(pendingKeys()).toEqual([]);
  expect(argsOf(backend.calls, "settings_set")).toHaveLength(0);
});
