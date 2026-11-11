// Why this lives here: a StrictMode double mount of the settings page runs
// register, load, cleanup, register, load. That sequence is driven straight
// against the queue so the test outlives the Today redesign (#129).
import { clearMocks } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  argsOf,
  deferred,
  emitSettingsChanged,
  mockBackend,
  SETTINGS,
  settle,
} from "../test/fixtures";
import type { Settings } from "./bindings";
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
  resetSettingsQueueForTests();
  clearMocks();
});

function listener() {
  return {
    shown: vi.fn<SettingsListener["shown"]>(),
    accepted: vi.fn<SettingsListener["accepted"]>(),
    refused: vi.fn<SettingsListener["refused"]>(),
    loadFailed: vi.fn<SettingsListener["loadFailed"]>(),
    saveFailed: vi.fn<SettingsListener["saveFailed"]>(),
  } satisfies SettingsListener;
}

// Each settings_get call is held; held[i] answers the i-th call.
function heldGets() {
  const held: ReturnType<typeof deferred<Settings>>[] = [];
  const reply = () => {
    const d = deferred<Settings>();
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
  const CHANGED: Settings = { ...SETTINGS, preset: "fifty_ten" };
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

test("settings_changed_reloads_behind_save_in_flight", async () => {
  const CHANGED: Settings = { ...SETTINGS, preset: "fifty_ten" };
  const saving = deferred<null>();
  const backend = mockBackend({ settings_set: () => saving.promise });
  const page = listener();
  register(page);
  load();
  await settle();
  save(CHANGED);
  await settle();
  expect(backend.live("settings-changed")).toBe(1);

  await emitSettingsChanged({ ...SETTINGS, theme: "dark" });
  expect(settingsCommands(backend)).toEqual(["settings_get", "settings_set"]);

  saving.resolve(null);
  await settle();
  expect(settingsCommands(backend)).toEqual(["settings_get", "settings_set", "settings_get"]);
  expect(argsOf(backend.calls, "settings_set")).toEqual([{ settings: CHANGED }]);
});

test("save_failed_reports_sent_restored_and_kind", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const CHANGED: Settings = { ...SETTINGS, preset: "fifty_ten" };
  const failures = [
    [() => Promise.reject({ kind: "write", message: "disk" }), "write"],
    [() => Promise.reject({ kind: "unavailable", message: "none" }), "unavailable"],
    [
      () => {
        throw new Error("boom");
      },
      "write",
    ],
  ] as const;
  for (const [reply, kind] of failures) {
    resetSettingsQueueForTests();
    mockBackend({ settings_set: reply });
    const page = listener();
    register(page);
    load();
    await settle();
    save(CHANGED);
    await settle();
    expect(page.saveFailed).toHaveBeenCalledWith(CHANGED, SETTINGS, kind);
    const failedAt = page.saveFailed.mock.invocationCallOrder[0] ?? 0;
    const rolledAt = page.shown.mock.invocationCallOrder.at(-1) ?? 0;
    expect(failedAt).toBeLessThan(rolledAt);
    expect(page.shown).toHaveBeenLastCalledWith(SETTINGS, true);
    clearMocks();
  }

  resetSettingsQueueForTests();
  mockBackend({ settings_set: () => Promise.reject({ kind: "invalidSpec", message: "x" }) });
  const page = listener();
  register(page);
  load();
  await settle();
  save({ ...SETTINGS, custom: { focusMin: 3, breakMin: 10 } });
  await settle();
  expect(page.saveFailed).not.toHaveBeenCalled();
});
