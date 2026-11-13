import { resetSettingsQueueForTests } from "@shared/ipc/settingsQueue";
import { resetTimerQueueForTests } from "@shared/ipc/timerQueue";
import { argsOf, KEYBOARD, settle } from "@shared/test/fixtures";
import { clearMocks } from "@tauri-apps/api/mocks";
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { openSettings } from "./Settings.support";

beforeEach(() => {
  resetTimerQueueForTests();
  resetSettingsQueueForTests();
});

afterEach(async () => {
  cleanup();
  await settle();
  resetSettingsQueueForTests();
  clearMocks();
  vi.restoreAllMocks();
});

const field = () =>
  within(screen.getByRole("group", { name: "Start or pause focus" })).getByRole("button", {
    name: /, everywhere/,
  });

const recordingCalls = (backend: { calls: { cmd: string; args: unknown }[] }) =>
  argsOf(backend.calls, "keyboard_recording");

test("bound_chord_while_recording_reaches_recorder", async () => {
  const { backend } = await openSettings({
    keyboard_recording: () => undefined,
    keyboard_set_binding: () => KEYBOARD,
  });
  fireEvent.click(field());
  await settle();
  // Shortcuts are suspended before the chord is pressed, so a chord that is already bound reaches the recorder.
  expect(recordingCalls(backend)).toEqual([{ on: true }]);
  fireEvent.keyDown(field(), { code: "KeyK", metaKey: true });
  await settle();
  expect(argsOf(backend.calls, "keyboard_set_binding")).toEqual([
    { id: "startPause", slot: "global", keys: "Super+KeyK", confirmWarning: false },
  ]);
});

test("recorder_off_on_record", async () => {
  const { backend } = await openSettings({
    keyboard_recording: () => undefined,
    keyboard_set_binding: () => KEYBOARD,
  });
  fireEvent.click(field());
  fireEvent.keyDown(field(), { code: "KeyG", ctrlKey: true, altKey: true });
  await settle();
  expect(recordingCalls(backend)).toEqual([{ on: true }, { on: false }]);
});

test("recorder_off_on_esc", async () => {
  const { backend } = await openSettings({ keyboard_recording: () => undefined });
  fireEvent.click(field());
  fireEvent.keyDown(field(), { code: "Escape" });
  await settle();
  expect(recordingCalls(backend)).toEqual([{ on: true }, { on: false }]);
});

test("recorder_off_on_blur", async () => {
  const { backend } = await openSettings({ keyboard_recording: () => undefined });
  fireEvent.click(field());
  fireEvent.blur(field());
  await settle();
  expect(recordingCalls(backend)).toEqual([{ on: true }, { on: false }]);
});

test("recorder_off_on_unmount", async () => {
  const { backend, unmount } = await openSettings({ keyboard_recording: () => undefined });
  fireEvent.click(field());
  await settle();
  unmount();
  await settle();
  expect(recordingCalls(backend)).toEqual([{ on: true }, { on: false }]);
});

test("recorder_off_waits_for_the_on_reply", async () => {
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const seen: boolean[] = [];
  const { backend } = await openSettings({
    keyboard_recording: async (args) => {
      seen.push((args as { on: boolean }).on);
      if (seen.length === 1) await gate;
      return undefined;
    },
  });
  fireEvent.click(field());
  fireEvent.keyDown(field(), { code: "Escape" });
  await settle();
  // The off is held back until the on has been answered, so Rust never sees them out of order.
  expect(seen).toEqual([true]);
  release();
  await settle();
  expect(seen).toEqual([true, false]);
  expect(recordingCalls(backend)).toEqual([{ on: true }, { on: false }]);
});
