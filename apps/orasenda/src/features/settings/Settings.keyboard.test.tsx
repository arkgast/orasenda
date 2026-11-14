import type { KeyboardView_Serialize } from "@shared/ipc/bindings";
import { resetSettingsQueueForTests } from "@shared/ipc/settingsQueue";
import { resetTimerQueueForTests } from "@shared/ipc/timerQueue";
import type { Replies } from "@shared/test/fixtures";
import { argsOf, KEYBOARD, mockBackend, SETTINGS, settle, withGlobal } from "@shared/test/fixtures";
import { clearMocks } from "@tauri-apps/api/mocks";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { openSettings, saveLine, sets } from "./Settings.support";

const openIn = (replies: Replies = {}) => openSettings(replies, "Shortcuts");

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
const field = (name: string) => within(group(name)).getByRole("button", { name: /, everywhere/ });

function press(name: string, init: KeyboardEventInit) {
  const button = field(name);
  fireEvent.click(button);
  fireEvent.keyDown(button, init);
}

const G = { code: "KeyG", ctrlKey: true, altKey: true };

const withStartPause = (patch: Parameters<typeof withGlobal>[2]) =>
  withGlobal(KEYBOARD, "startPause", patch);

const G_VIEW = withStartPause({
  keys: "Control+Alt+KeyG",
  display: "⌃⌥G",
  spoken: "Control-Option-G",
});

test("keyboard_rows_order_and_copy", async () => {
  await openIn();
  expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual([
    "Shortcuts",
  ]);
  const nav = within(screen.getByRole("navigation", { name: "Settings" }));
  expect(nav.getByRole("button", { name: "Shortcuts" })).toHaveAttribute("aria-current", "page");
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
    "Full screen on this display",
    "Floating timer, there and back",
    "Commands",
    "Settings",
  ]) {
    expect(within(table).getByRole("rowheader", { name: action })).toBeInTheDocument();
  }
  expect(screen.queryByText(/VoiceOver uses/)).toBeNull();
});

test("keyboard_record_saves_with_line", async () => {
  const { backend } = await openIn({ keyboard_set_binding: () => G_VIEW });
  press("Start or pause focus", G);
  await settle();
  expect(argsOf(backend.calls, "keyboard_set_binding")).toEqual([
    { id: "startPause", slot: "global", keys: "Control+Alt+KeyG", confirmWarning: false },
  ]);
  expect(saveLine()).toHaveTextContent("Start or pause focus: ⌃⌥G.");
  expect(within(group("Start or pause focus")).getByText("⌃⌥G")).toBeInTheDocument();

  // Command is Super in the canonical form, and Return is Enter.
  press("Capture a thought", { code: "Enter", metaKey: true, shiftKey: true });
  await settle();
  expect(argsOf(backend.calls, "keyboard_set_binding")[1]).toEqual({
    id: "capture",
    slot: "global",
    keys: "Shift+Super+Enter",
    confirmWarning: false,
  });
});

test("keyboard_delete_turns_off_and_restore_default", async () => {
  const off = withStartPause({ keys: null, display: null, spoken: null, status: "off" });
  const { backend } = await openIn({
    keyboard_set_binding: () => off,
    keyboard_restore_default: () => KEYBOARD,
  });
  press("Start or pause focus", { code: "Backspace" });
  await settle();
  expect(argsOf(backend.calls, "keyboard_set_binding")).toEqual([
    { id: "startPause", slot: "global", keys: null, confirmWarning: false },
  ]);
  expect(saveLine()).toHaveTextContent("Start or pause focus: off.");
  // The first button is the In Orasenda slot's, the second the Everywhere slot's.
  fireEvent.click(
    within(group("Start or pause focus")).getAllByRole("button", { name: "Restore default" })[1],
  );
  await settle();
  expect(argsOf(backend.calls, "keyboard_restore_default")).toEqual([
    { id: "startPause", slot: "global" },
  ]);
  expect(saveLine()).toHaveTextContent("Start or pause focus: ⌃⌥F.");
});

test("keyboard_unavailable_keeps_old_and_shows_conflict", async () => {
  await openIn({ keyboard_set_binding: () => Promise.reject("unavailable") });
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
  await openIn({ keyboard_state: () => withStartPause({ status: "failed" }) });
  expect(
    within(group("Start or pause focus")).getByText(
      "Another app uses this shortcut. Pick a different one.",
    ),
  ).toBeVisible();
});

test("keyboard_in_use_by_orasenda_line", async () => {
  await openIn({
    keyboard_set_binding: () => Promise.reject({ inUse: { action: "Commands" } }),
  });
  press("Capture a thought", { code: "KeyK", metaKey: true });
  await settle();
  expect(
    within(group("Capture a thought")).getByText(
      "Orasenda uses this for commands. Pick a different one.",
    ),
  ).toBeVisible();
});

test("keyboard_other_errors_are_not_silent", async () => {
  await openIn({ keyboard_set_binding: () => Promise.reject("store") });
  press("Capture a thought", G);
  await settle();
  expect(
    within(group("Capture a thought")).getByText(/Orasenda can't save this shortcut/),
  ).toBeVisible();
});

test("keyboard_voice_over_line_only_when_on", async () => {
  await openIn({ keyboard_state: () => ({ ...KEYBOARD, voiceOver: true }) });
  const line = "VoiceOver uses Control-Option keys. You may want a different shortcut.";
  expect(within(group("Start or pause focus")).getByText(line)).toBeVisible();
  expect(within(group("Capture a thought")).getByText(line)).toBeVisible();
  cleanup();
  await settle();
  clearMocks();
  resetSettingsQueueForTests();
  resetTimerQueueForTests();
  await openIn({
    keyboard_state: () => ({
      ...withStartPause({ keys: "Super+Period", display: "⌘.", spoken: "Command-Period" }),
      voiceOver: true,
    }),
  });
  expect(within(group("Start or pause focus")).queryByText(line)).toBeNull();
});

test("keyboard_single_key_toggle_saves", async () => {
  const { backend } = await openIn();
  const box = within(group("Single-key shortcuts")).getByRole("checkbox");
  expect(box).toBeChecked();
  fireEvent.click(box);
  await settle();
  expect(sets(backend).at(-1)?.settings).toEqual({ ...SETTINGS, singleKey: false });
  expect(box).not.toBeChecked();
});

test("keyboard_list_marks_single_keys_off", async () => {
  await openIn({ settings_get: () => ({ ...SETTINGS, singleKey: false }) });
  const table = screen.getByRole("table", { name: "All shortcuts" });
  const today = within(table).getByRole("rowheader", { name: "On Today" });
  expect(today.closest("tr")).toHaveAttribute("data-off", "true");
  const focus = within(table).getByRole("rowheader", { name: "In Focus view" });
  expect(focus.closest("tr")).toHaveAttribute("data-off", "true");
  expect(
    within(table).getByRole("rowheader", { name: "Commands" }).closest("tr"),
  ).not.toHaveAttribute("data-off");
});

test("keyboard_target_focuses_the_pane", async () => {
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
  expect(screen.getByRole("heading", { level: 2, name: "Shortcuts" })).toHaveFocus();
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
  await openIn({
    keyboard_set_binding: () => (++calls === 1 ? first.promise : second.promise),
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
  await openIn({
    keyboard_set_binding: () => (++calls === 1 ? first.promise : second.promise),
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
  const { backend } = await openIn({
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
