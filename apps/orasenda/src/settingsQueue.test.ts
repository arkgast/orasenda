// Why this lives here: a StrictMode double mount of the settings page runs
// register, load, cleanup, register, load. That sequence is driven straight
// against the queue so the test outlives the Today redesign (#129).
import { clearMocks } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { TimerSettings } from "./bindings";
import { argsOf, deferred, mockBackend, SETTINGS, settle } from "./pages/testing";
import {
  load,
  register,
  resetSettingsQueueForTests,
  type SettingsListener,
  save,
} from "./settingsQueue";

beforeEach(() => {
  resetSettingsQueueForTests();
});

afterEach(async () => {
  await settle();
  clearMocks();
});

function listener() {
  return {
    shown: vi.fn<SettingsListener["shown"]>(),
    accepted: vi.fn<SettingsListener["accepted"]>(),
    refused: vi.fn<SettingsListener["refused"]>(),
    loadFailed: vi.fn<SettingsListener["loadFailed"]>(),
  } satisfies SettingsListener;
}

// Each settings_get call is held; held[i] answers the i-th call.
function heldGets() {
  const held: ReturnType<typeof deferred<TimerSettings>>[] = [];
  const reply = () => {
    const d = deferred<TimerSettings>();
    held.push(d);
    return d.promise;
  };
  return { held, reply };
}

function settingsCommands(backend: ReturnType<typeof mockBackend>) {
  return backend.calls.map((call) => call.cmd).filter((cmd) => cmd.startsWith("settings_"));
}

test("strict_mode_mount_sends_one_settings_get", async () => {
  const gets = heldGets();
  const backend = mockBackend({ settings_get: gets.reply });

  const first = listener();
  const unregisterFirst = register(first);
  load();
  unregisterFirst();
  const second = listener();
  register(second);
  load();
  await settle();

  expect(settingsCommands(backend)).toEqual(["settings_get"]);

  gets.held[0]?.resolve(SETTINGS);
  await settle();

  expect(second.shown).toHaveBeenCalledTimes(1);
  expect(second.shown).toHaveBeenCalledWith(SETTINGS, true);
  expect(first.shown).not.toHaveBeenCalled();
  expect(settingsCommands(backend)).toEqual(["settings_get"]);
});

test("remount_after_a_change_queues_one_more_get", async () => {
  const CHANGED: TimerSettings = { ...SETTINGS, preset: "fifty_ten" };
  const gets = heldGets();
  const saving = deferred<null>();
  const backend = mockBackend({
    settings_get: gets.reply,
    settings_set: () => saving.promise,
  });

  const first = listener();
  const unregisterFirst = register(first);
  load();
  await settle();

  save(CHANGED);
  unregisterFirst();
  const second = listener();
  register(second);
  load();
  await settle();

  expect(settingsCommands(backend)).toEqual(["settings_get"]);
  expect(first.shown).toHaveBeenCalledTimes(1);
  expect(first.shown).toHaveBeenCalledWith(CHANGED, false);
  expect(second.shown).toHaveBeenCalledWith(CHANGED, true);

  gets.held[0]?.resolve(SETTINGS);
  await settle();
  expect(settingsCommands(backend)).toEqual(["settings_get", "settings_set"]);
  expect(argsOf(backend.calls, "settings_set")).toEqual([{ settings: CHANGED }]);

  saving.resolve(null);
  await settle();
  expect(settingsCommands(backend)).toEqual(["settings_get", "settings_set", "settings_get"]);

  gets.held[1]?.resolve(CHANGED);
  await settle();
});
