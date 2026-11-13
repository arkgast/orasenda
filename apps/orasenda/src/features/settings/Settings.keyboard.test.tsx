import { clearMocks } from "@tauri-apps/api/mocks";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { KeyboardView_Serialize } from "../../ipc/bindings";
import { resetSettingsQueueForTests } from "../../ipc/settingsQueue";
import { resetTimerQueueForTests } from "../../ipc/timerQueue";
import { argsOf, KEYBOARD, mockBackend, SETTINGS, settle } from "../../test/fixtures";
import { openSettings, saveLine, sets } from "./Settings.support";

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
  delete document.documentElement.dataset.theme;
});

const group = (name: string) => screen.getByRole("group", { name });
const field = (name: string) => within(group(name)).getByRole("button", { name: /from anywhere/ });

function press(name: string, init: KeyboardEventInit) {
  const button = field(name);
  fireEvent.click(button);
  fireEvent.keyDown(button, init);
}

const G = { code: "KeyG", ctrlKey: true, altKey: true };

const withStartPause = (patch: Partial<KeyboardView_Serialize["startPause"]>) => ({
  ...KEYBOARD,
  startPause: { ...KEYBOARD.startPause, ...patch },
});

const G_VIEW = withStartPause({
  keys: "Control+Alt+KeyG",
  display: "⌃⌥G",
  spoken: "Control-Option-G",
});

test("keyboard_rows_order_and_copy", async () => {
  await openSettings();
  const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
  const at = headings.indexOf("Keyboard");
  expect(headings[at - 1]).toBe("Notifications");
  expect(headings[at + 1]).toBe("Apps and sites");
  const nav = within(screen.getByRole("navigation", { name: "Settings sections" }));
  expect(nav.getByRole("button", { name: /^Keyboard/ })).toBeInTheDocument();
  const rows = ["Start or pause focus", "Capture a thought", "Single-key shortcuts"];
  const nodes = rows.map(group);
  for (let i = 1; i < nodes.length; i++) {
    expect(
      nodes[i - 1].compareDocumentPosition(nodes[i]) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  }
  expect(within(group("Start or pause focus")).getByText("⌃⌥F")).toBeInTheDocument();
  expect(within(group("Capture a thought")).getByText("⌃⌥N")).toBeInTheDocument();
  expect(
    screen.getByText("Space, F and P on Today, Space in Focus view. Shortcuts with ⌘ always work."),
  ).toBeInTheDocument();
  const table = screen.getByRole("table", { name: "All shortcuts" });
  for (const action of [
    "Start focus",
    "Just 2 minutes",
    "End session",
    "Full screen",
    "Floating timer",
    "Commands",
    "Settings",
  ]) {
    expect(within(table).getByRole("rowheader", { name: action })).toBeInTheDocument();
  }
  expect(screen.queryByText(/VoiceOver uses/)).toBeNull();
});

test("keyboard_record_saves_with_line", async () => {
  const { backend } = await openSettings({ keyboard_set_shortcut: () => G_VIEW });
  press("Start or pause focus", G);
  await settle();
  expect(argsOf(backend.calls, "keyboard_set_shortcut")).toEqual([
    { id: "startPause", keys: "Control+Alt+KeyG" },
  ]);
  expect(saveLine()).toHaveTextContent("Start or pause focus: ⌃⌥G.");
  expect(within(group("Start or pause focus")).getByText("⌃⌥G")).toBeInTheDocument();

  // Command is Super in the canonical form, and Return is Enter.
  press("Capture a thought", { code: "Enter", metaKey: true, shiftKey: true });
  await settle();
  expect(argsOf(backend.calls, "keyboard_set_shortcut")[1]).toEqual({
    id: "capture",
    keys: "Shift+Super+Enter",
  });
});

test("keyboard_delete_turns_off_and_restore_default", async () => {
  const off = { ...KEYBOARD.startPause, keys: null, display: null, spoken: null, status: "off" };
  const { backend } = await openSettings({
    keyboard_set_shortcut: () => ({ ...KEYBOARD, startPause: off }),
    keyboard_restore_default: () => KEYBOARD,
  });
  press("Start or pause focus", { code: "Backspace" });
  await settle();
  expect(argsOf(backend.calls, "keyboard_set_shortcut")).toEqual([
    { id: "startPause", keys: null },
  ]);
  expect(saveLine()).toHaveTextContent("Start or pause focus: off.");
  fireEvent.click(
    within(group("Start or pause focus")).getByRole("button", { name: "Restore default" }),
  );
  await settle();
  expect(argsOf(backend.calls, "keyboard_restore_default")).toEqual([{ id: "startPause" }]);
  expect(saveLine()).toHaveTextContent("Start or pause focus: ⌃⌥F.");
});

test("keyboard_unavailable_keeps_old_and_shows_conflict", async () => {
  await openSettings({ keyboard_set_shortcut: () => Promise.reject("unavailable") });
  press("Start or pause focus", G);
  await settle();
  const row = group("Start or pause focus");
  expect(within(row).getByText("⌃⌥F")).toBeInTheDocument();
  expect(
    within(row).getByText("Another app uses this shortcut. Pick a different one."),
  ).toBeVisible();
  expect(saveLine()).not.toHaveTextContent("Start or pause focus: ⌃⌥G.");
});

test("keyboard_failed_status_shows_the_same_line", async () => {
  await openSettings({ keyboard_state: () => withStartPause({ status: "failed" }) });
  expect(
    within(group("Start or pause focus")).getByText(
      "Another app uses this shortcut. Pick a different one.",
    ),
  ).toBeVisible();
});

test("keyboard_in_use_by_orasenda_line", async () => {
  await openSettings({ keyboard_set_shortcut: () => Promise.reject("inUseByOrasenda") });
  press("Capture a thought", { code: "KeyK", metaKey: true });
  await settle();
  expect(
    within(group("Capture a thought")).getByText(
      "Orasenda already uses this shortcut. Pick a different one.",
    ),
  ).toBeVisible();
});

test("keyboard_other_errors_are_not_silent", async () => {
  await openSettings({ keyboard_set_shortcut: () => Promise.reject("store") });
  press("Capture a thought", G);
  await settle();
  expect(
    within(group("Capture a thought")).getByText(/Orasenda can't save this shortcut/),
  ).toBeVisible();
});

test("keyboard_voice_over_line_only_when_on", async () => {
  await openSettings({ keyboard_state: () => ({ ...KEYBOARD, voiceOver: true }) });
  const line = "VoiceOver uses Control-Option keys. You may want a different shortcut.";
  expect(within(group("Start or pause focus")).getByText(line)).toBeVisible();
  expect(within(group("Capture a thought")).getByText(line)).toBeVisible();
  cleanup();
  await settle();
  clearMocks();
  resetSettingsQueueForTests();
  resetTimerQueueForTests();
  await openSettings({
    keyboard_state: () => ({
      ...KEYBOARD,
      voiceOver: true,
      startPause: {
        ...KEYBOARD.startPause,
        keys: "Super+Period",
        display: "⌘.",
        spoken: "Command-Period",
      },
    }),
  });
  expect(within(group("Start or pause focus")).queryByText(line)).toBeNull();
});

test("keyboard_single_key_toggle_saves", async () => {
  const { backend } = await openSettings();
  const box = within(group("Single-key shortcuts")).getByRole("checkbox");
  expect(box).toBeChecked();
  fireEvent.click(box);
  await settle();
  expect(sets(backend).at(-1)?.settings).toEqual({ ...SETTINGS, singleKey: false });
  expect(box).not.toBeChecked();
});

test("keyboard_list_marks_single_keys_off", async () => {
  await openSettings({ settings_get: () => ({ ...SETTINGS, singleKey: false }) });
  const table = screen.getByRole("table", { name: "All shortcuts" });
  const today = within(table).getByRole("rowheader", { name: "On Today" });
  expect(today.closest("tr")).toHaveAttribute("data-off", "true");
  const focus = within(table).getByRole("rowheader", { name: "In Focus view" });
  expect(focus.closest("tr")).toHaveAttribute("data-off", "true");
  expect(
    within(table).getByRole("rowheader", { name: "Commands" }).closest("tr"),
  ).not.toHaveAttribute("data-off");
});

test("keyboard_target_focuses_the_section", async () => {
  const { Settings: Page } = await import("./Settings");
  mockBackend();
  render(
    <Page
      info={{ status: "loading" }}
      arrival={{ seq: 1, target: "keyboard" }}
      onNavigate={() => {}}
    />,
  );
  await settle();
  expect(screen.getByRole("heading", { level: 2, name: "Keyboard" })).toHaveFocus();
});

function later() {
  let resolve: (value: KeyboardView_Serialize) => void = () => {};
  let reject: (reason: string) => void = () => {};
  const promise = new Promise<KeyboardView_Serialize>((ok, no) => {
    resolve = ok;
    reject = no;
  });
  return { promise, resolve, reject };
}

const H_VIEW = withStartPause({
  keys: "Control+Alt+KeyH",
  display: "⌃⌥H",
  spoken: "Control-Option-H",
});
const H = { code: "KeyH", ctrlKey: true, altKey: true };

test("keyboard_newest_wins", async () => {
  const first = later();
  const second = later();
  let calls = 0;
  await openSettings({
    keyboard_set_shortcut: () => (++calls === 1 ? first.promise : second.promise),
  });
  press("Start or pause focus", G);
  press("Start or pause focus", H);
  second.resolve(H_VIEW);
  await settle();
  first.resolve(G_VIEW);
  await settle();
  const row = group("Start or pause focus");
  expect(within(row).getByText("⌃⌥H")).toBeInTheDocument();
  expect(within(row).queryByText("⌃⌥G")).toBeNull();
  expect(saveLine()).toHaveTextContent("Start or pause focus: ⌃⌥H.");
});

test("keyboard_older_failure_after_newer_success_shows_no_conflict", async () => {
  const first = later();
  const second = later();
  let calls = 0;
  await openSettings({
    keyboard_set_shortcut: () => (++calls === 1 ? first.promise : second.promise),
  });
  press("Start or pause focus", G);
  press("Start or pause focus", H);
  second.resolve(H_VIEW);
  await settle();
  first.reject("unavailable");
  await settle();
  expect(screen.queryByText("Another app uses this shortcut. Pick a different one.")).toBeNull();
  expect(saveLine()).toHaveTextContent("Start or pause focus: ⌃⌥H.");
});

test("keyboard_single_key_failure_rolls_back_and_try_again_resends", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  let fail = true;
  const { backend } = await openSettings({
    settings_set: () => (fail ? Promise.reject("write failed") : null),
  });
  const box = within(group("Single-key shortcuts")).getByRole("checkbox");
  fireEvent.click(box);
  await settle();
  expect(box).toBeChecked();
  expect(saveLine()).toHaveTextContent("Single-key shortcuts weren't saved. Back to on.");
  fail = false;
  fireEvent.click(screen.getByRole("button", { name: "Try again saving single-key shortcuts" }));
  await settle();
  expect(sets(backend).at(-1)?.settings.singleKey).toBe(false);
});
