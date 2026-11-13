import type { KeyboardView_Serialize, NoteView } from "@shared/ipc/bindings";
import { events } from "@shared/ipc/bindings";
import {
  argsOf,
  deferred,
  emitInboxChanged,
  mockBackend,
  NOTES,
  type Replies,
  settle,
} from "@shared/test/fixtures";
import { clearMocks } from "@tauri-apps/api/mocks";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { BoardPage } from "./BoardPage";

const shortcut = (status: "registered" | "off" | "failed", display: string | null) => ({
  keys: display ? "Control+Alt+KeyN" : null,
  display,
  spoken: display ? "Control-Option-N" : null,
  status,
});
const KEYBOARD: KeyboardView_Serialize = {
  startPause: shortcut("registered", "⌃⌥F"),
  capture: shortcut("registered", "⌃⌥N"),
  singleKey: true,
  voiceOver: false,
};
const THREE: NoteView[] = [
  ...NOTES.slice(0, 1),
  { ...NOTES[0], id: "note-3", text: "Call the dentist" },
  ...NOTES.slice(1),
];

beforeEach(() => vi.useRealTimers());
afterEach(async () => {
  cleanup();
  await settle();
  clearMocks();
  vi.useRealTimers();
});

async function renderBoard(replies: Replies = {}) {
  const backend = mockBackend({ keyboard_state: () => KEYBOARD, ...replies });
  const view = render(<BoardPage onNavigate={() => {}} />);
  await settle();
  return { backend, ...view };
}
const rowTexts = () =>
  screen.queryAllByRole("listitem").map((li) => li.querySelector("p")?.textContent);
const removeButton = (text: string) => screen.getByRole("button", { name: `Remove note: ${text}` });

test("board_lists_newest_first", async () => {
  await renderBoard();
  expect(screen.getByRole("heading", { level: 1, name: "Inbox" })).toBeInTheDocument();
  expect(rowTexts()).toEqual(["Email the landlord about the lease", "Try the smaller timer ring"]);
  expect(screen.getByText(/External/)).toBeInTheDocument();
});

test("board_updates_on_inbox_changed", async () => {
  await renderBoard();
  await emitInboxChanged(THREE);
  expect(rowTexts()).toHaveLength(3);
  await emitInboxChanged([]);
  expect(screen.getByText("Nothing in your Inbox.")).toBeInTheDocument();
});

test("board_remove_then_undo", async () => {
  const { backend } = await renderBoard();
  fireEvent.click(removeButton("Email the landlord about the lease"));
  expect(rowTexts()).toEqual(["Try the smaller timer ring"]);
  expect(screen.getByText("Note removed.")).toBeInTheDocument();
  expect(argsOf(backend.calls, "inbox_remove")).toEqual([{ id: "note-2" }]);
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /Undo/ }));
  });
  await settle();
  expect(argsOf(backend.calls, "inbox_restore")).toEqual([{ id: "note-2" }]);
  expect(rowTexts()).toEqual(["Email the landlord about the lease", "Try the smaller timer ring"]);
  expect(screen.queryByText("Note removed.")).not.toBeInTheDocument();
});

test("board_undo_line_ends_after_ten_seconds_or_the_next_removal", async () => {
  await renderBoard({ inbox_list: () => THREE });
  vi.useFakeTimers();
  fireEvent.click(removeButton("Call the dentist"));
  act(() => vi.advanceTimersByTime(10_001));
  expect(screen.queryByText("Note removed.")).not.toBeInTheDocument();
  fireEvent.click(removeButton("Try the smaller timer ring"));
  expect(screen.getByText("Note removed.")).toBeInTheDocument();
});

test("board_remove_failure_line", async () => {
  await renderBoard({ inbox_remove: () => Promise.reject("store") });
  fireEvent.click(removeButton("Email the landlord about the lease"));
  await settle();
  expect(rowTexts()).toHaveLength(2);
  expect(
    screen.getByText("Couldn't remove the note. It's still in your Inbox."),
  ).toBeInTheDocument();
  expect(screen.queryByText("Note removed.")).not.toBeInTheDocument();
});

test("board_restore_failure_line", async () => {
  await renderBoard({ inbox_restore: () => Promise.reject("store") });
  fireEvent.click(removeButton("Email the landlord about the lease"));
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /Undo/ }));
  });
  await settle();
  expect(screen.getByText("Couldn't bring the note back.")).toBeInTheDocument();
  expect(rowTexts()).toEqual(["Try the smaller timer ring"]);
});

test("board_load_failure_is_not_the_empty_state", async () => {
  await renderBoard({ inbox_list: () => Promise.reject("store") });
  expect(screen.getByText("Orasenda can't read your Inbox right now.")).toBeInTheDocument();
  expect(screen.queryByText("Nothing in your Inbox.")).not.toBeInTheDocument();
});

test("board_shows_nothing_while_loading", async () => {
  const gate = deferred<NoteView[]>();
  mockBackend({ keyboard_state: () => KEYBOARD, inbox_list: () => gate.promise });
  render(<BoardPage onNavigate={() => {}} />);
  await settle();
  expect(screen.queryByText("Nothing in your Inbox.")).not.toBeInTheDocument();
  gate.resolve([]);
  await settle();
  expect(screen.getByText("Nothing in your Inbox.")).toBeInTheDocument();
});

test("board_empty_copy_follows_shortcut_status", async () => {
  const { unmount } = await renderBoard({ inbox_list: () => [] });
  expect(screen.getByText("⌃⌥N captures a thought from anywhere.")).toBeInTheDocument();
  unmount();
  cleanup();
  clearMocks();
  for (const status of ["off", "failed"] as const) {
    const { unmount: again } = await renderBoard({
      inbox_list: () => [],
      keyboard_state: () => ({
        ...KEYBOARD,
        capture: shortcut(status, status === "off" ? null : "⌃⌥N"),
      }),
    });
    expect(screen.getByText("Capture a thought from the menu bar.")).toBeInTheDocument();
    again();
    cleanup();
    clearMocks();
  }
});

test("board_empty_copy_follows_keyboard_changed", async () => {
  await renderBoard({ inbox_list: () => [] });
  await act(async () => {
    await events.keyboardChanged.emit({ ...KEYBOARD, capture: shortcut("off", null) });
  });
  expect(screen.getByText("Capture a thought from the menu bar.")).toBeInTheDocument();
});

test("board_focus_after_remove", async () => {
  await renderBoard({ inbox_list: () => THREE });
  // The first row: focus goes to the next row's Remove.
  fireEvent.click(removeButton("Email the landlord about the lease"));
  expect(removeButton("Call the dentist")).toHaveFocus();
  // The last row: focus goes to the previous row's Remove.
  fireEvent.click(removeButton("Try the smaller timer ring"));
  expect(removeButton("Call the dentist")).toHaveFocus();
  // The only row: focus goes to the heading.
  fireEvent.click(removeButton("Call the dentist"));
  expect(screen.getByRole("heading", { name: "Inbox" })).toHaveFocus();
});

test("board_undo_waits_for_the_remove_and_keeps_focus", async () => {
  const gate = deferred<null>();
  const { backend } = await renderBoard({
    inbox_list: () => THREE,
    inbox_remove: () => gate.promise,
  });
  fireEvent.click(removeButton("Call the dentist"));
  fireEvent.click(screen.getByRole("button", { name: /Undo/ }));
  await settle();
  // The restore has not run: the remove is still in flight.
  expect(argsOf(backend.calls, "inbox_restore")).toHaveLength(0);
  gate.resolve(null);
  await settle();
  expect(rowTexts()).toContain("Call the dentist");
});

test("board_undo_failure_focuses_the_heading", async () => {
  await renderBoard({
    inbox_list: () => THREE,
    inbox_restore: () => Promise.reject("store"),
  });
  fireEvent.click(removeButton("Call the dentist"));
  fireEvent.click(screen.getByRole("button", { name: /Undo/ }));
  await settle();
  expect(screen.getByText("Couldn't bring the note back.")).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Inbox" })).toHaveFocus();
});
