import { resetSettingsQueueForTests } from "@shared/ipc/settingsQueue";
import { resetTimerQueueForTests } from "@shared/ipc/timerQueue";
import { argsOf, KEYBOARD, settle, withGlobal } from "@shared/test/fixtures";
import { clearMocks } from "@tauri-apps/api/mocks";
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { openSettings, saveLine } from "./Settings.support";

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

const group = (name: string) => screen.getByRole("group", { name });
const everywhere = (row: string) =>
  within(group(row)).getByRole("button", { name: /, everywhere/ });
const inOrasenda = (row: string) =>
  within(group(row)).getByRole("button", { name: /, in Orasenda/ });

function press(field: HTMLElement, init: KeyboardEventInit) {
  fireEvent.click(field);
  fireEvent.keyDown(field, init);
}

const U = { code: "KeyU", metaKey: true };
const START = "Start or pause focus";

test("shortcuts_rows_have_two_labelled_recorders_and_a_status_word", async () => {
  await openSettings();
  for (const row of [START, "Capture a thought"]) {
    expect(everywhere(row)).toHaveAccessibleName(new RegExp(`^${row}, everywhere`));
    expect(inOrasenda(row)).toHaveAccessibleName(new RegExp(`^${row}, in Orasenda`));
  }
  // The in-Orasenda slot of both actions is empty by default.
  expect(inOrasenda(START)).toHaveAccessibleName(/None/);
  expect(within(group(START)).getByText("Everywhere: Registered")).toBeVisible();
});

test("shortcuts_status_word_off_and_failed", async () => {
  const off = withGlobal(KEYBOARD, "capture", {
    keys: null,
    display: null,
    spoken: null,
    status: "off",
  });
  await openSettings({ keyboard_state: () => withGlobal(off, "startPause", { status: "failed" }) });
  expect(within(group("Capture a thought")).getByText("Everywhere: Off")).toBeVisible();
  expect(everywhere("Capture a thought")).toHaveAccessibleName(/None/);
  expect(within(group(START)).getByText("Everywhere: Not available")).toBeVisible();
});

test("shortcuts_in_orasenda_slot_records_for_the_app_slot", async () => {
  const { backend } = await openSettings({ keyboard_set_binding: () => KEYBOARD });
  press(inOrasenda(START), U);
  await settle();
  expect(argsOf(backend.calls, "keyboard_set_binding")).toEqual([
    { id: "startPause", slot: "app", keys: "Super+KeyU", confirmWarning: false },
  ]);
  expect(saveLine()).toHaveTextContent(/^Start or pause focus in Orasenda:/);
});

test("shortcuts_restore_default_per_slot", async () => {
  const { backend } = await openSettings({ keyboard_restore_default: () => KEYBOARD });
  const row = group(START);
  const buttons = within(row).getAllByRole("button", { name: "Restore default" });
  expect(buttons).toHaveLength(2);
  fireEvent.click(buttons[0]);
  await settle();
  expect(argsOf(backend.calls, "keyboard_restore_default")).toEqual([
    { id: "startPause", slot: "app" },
  ]);
});

test("shortcuts_needs_modifier_line_depends_on_the_slot", async () => {
  await openSettings({
    keyboard_set_binding: () => Promise.reject({ needsModifier: { slot: "app" } }),
  });
  press(inOrasenda(START), { code: "KeyU", altKey: true });
  await settle();
  expect(
    within(group(START)).getByText("Add ⌘ or ⌃. A single key can't be a shortcut."),
  ).toBeVisible();
});

test("shortcuts_store_error_line", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  await openSettings({ keyboard_set_binding: () => Promise.reject("store") });
  press(everywhere(START), { code: "KeyG", ctrlKey: true, altKey: true });
  await settle();
  expect(
    within(group(START)).getByText("Orasenda can't save this shortcut right now."),
  ).toBeVisible();
});

test("shortcuts_voice_over_line_for_ctrl_opt_cmd", async () => {
  const bound = withGlobal(KEYBOARD, "startPause", {
    keys: "Control+Alt+Super+KeyG",
    display: "⌃⌥⌘G",
    spoken: "Control-Option-Command-G",
  });
  await openSettings({ keyboard_state: () => ({ ...bound, voiceOver: true }) });
  expect(
    within(group(START)).getByText(
      "VoiceOver uses this key while it's on. Pick another to use both.",
    ),
  ).toBeVisible();
  // The capture default is a plain Control-Option binding: spec F's line stays.
  expect(
    within(group("Capture a thought")).getByText(
      "VoiceOver uses Control-Option keys. You may want a different shortcut.",
    ),
  ).toBeVisible();
});

test("warning_pick_another_first", async () => {
  const replies = [
    () => Promise.reject({ warning: { reason: "Other apps use this." } }),
    () =>
      withGlobal(KEYBOARD, "startPause", {
        keys: "Control+Alt+KeyG",
        display: "⌃⌥G",
        spoken: "Control-Option-G",
      }),
  ];
  const { backend } = await openSettings({ keyboard_set_binding: () => replies.shift()?.() });
  press(everywhere(START), { code: "KeyG", ctrlKey: true, altKey: true });
  await settle();
  const row = within(group(START));
  expect(row.getByText("Other apps use this. Use it everywhere anyway?")).toBeVisible();
  const pick = row.getByRole("button", { name: "Pick another" });
  const use = row.getByRole("button", { name: "Use anyway" });
  expect(pick.compareDocumentPosition(use) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(pick).toHaveFocus();
  fireEvent.click(use);
  await settle();
  expect(argsOf(backend.calls, "keyboard_set_binding")).toEqual([
    { id: "startPause", slot: "global", keys: "Control+Alt+KeyG", confirmWarning: false },
    { id: "startPause", slot: "global", keys: "Control+Alt+KeyG", confirmWarning: true },
  ]);
  expect(row.queryByRole("button", { name: "Use anyway" })).toBeNull();
  expect(everywhere(START)).toHaveFocus();
  expect(saveLine()).toHaveTextContent("Start or pause focus: ⌃⌥G.");
});

test("warning_pick_another_sends_nothing", async () => {
  const { backend } = await openSettings({
    keyboard_set_binding: () => Promise.reject({ warning: { reason: "Other apps use this." } }),
  });
  press(everywhere(START), { code: "KeyG", ctrlKey: true, altKey: true });
  await settle();
  fireEvent.click(within(group(START)).getByRole("button", { name: "Pick another" }));
  await settle();
  expect(argsOf(backend.calls, "keyboard_set_binding")).toHaveLength(1);
  expect(within(group(START)).queryByRole("button", { name: "Use anyway" })).toBeNull();
  expect(everywhere(START)).toHaveFocus();
});
