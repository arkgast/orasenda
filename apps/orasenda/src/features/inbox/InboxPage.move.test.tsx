import type { NoteView } from "@shared/ipc/bindings";
import {
  argsOf,
  boardTask,
  emitInboxChanged,
  KEYBOARD,
  mockBackend,
  NOTES,
  type Replies,
  SETTINGS,
  settle,
} from "@shared/test/fixtures";
import { clearMocks } from "@tauri-apps/api/mocks";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { InboxPage } from "./InboxPage";

const THREE: NoteView[] = [
  NOTES[0],
  { ...NOTES[0], id: "note-3", text: "Call the dentist" },
  NOTES[1],
];

afterEach(async () => {
  cleanup();
  await settle();
  clearMocks();
});

async function renderInbox(
  options: { singleKey?: boolean; replies?: Replies; onNavigate?: (page: string) => void } = {},
) {
  const backend = mockBackend({
    keyboard_state: () => KEYBOARD,
    inbox_list: () => THREE,
    settings_get: () => ({ ...SETTINGS, singleKey: options.singleKey ?? true }),
    inbox_to_task: (args) =>
      boardTask("task-9", "Moved", "backlog", {
        sourceNoteId: (args as { noteId: string }).noteId,
      }),
    task_restore_note: () => null,
    ...options.replies,
  });
  render(<InboxPage onNavigate={options.onNavigate ?? (() => {})} />);
  await settle();
  return backend;
}
const row = (text: string) => screen.getByText(text).closest("li") as HTMLElement;
const rowTexts = () =>
  screen.queryAllByRole("listitem").map((li) => li.querySelector("p")?.textContent);

test("move_to_board_from_menu", async () => {
  const backend = await renderInbox();
  fireEvent.click(screen.getByRole("button", { name: "More actions for Call the dentist" }));
  await act(async () => {
    fireEvent.click(screen.getByRole("menuitem", { name: "Move to Board" }));
  });
  await settle();
  expect(argsOf(backend.calls, "inbox_to_task")).toEqual([{ noteId: "note-3" }]);
  expect(rowTexts()).not.toContain("Call the dentist");
  expect(screen.getByText("Moved to Board")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Undo/ })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Open Board/ })).toBeInTheDocument();
});

test("b_key_moves_focused_row", async () => {
  const backend = await renderInbox();
  row("Call the dentist").focus();
  await act(async () => {
    fireEvent.keyDown(row("Call the dentist"), { key: "b" });
  });
  await settle();
  expect(argsOf(backend.calls, "inbox_to_task")).toEqual([{ noteId: "note-3" }]);
  expect(screen.getByText("Moved to Board")).toBeInTheDocument();
});

test("b_key_does_nothing_with_single_keys_off", async () => {
  const backend = await renderInbox({ singleKey: false });
  row("Call the dentist").focus();
  fireEvent.keyDown(row("Call the dentist"), { key: "b" });
  await settle();
  expect(argsOf(backend.calls, "inbox_to_task")).toEqual([]);
  expect(rowTexts()).toContain("Call the dentist");
});

test("b_key_ignores_repeats_and_keys_typed_in_the_menu_button", async () => {
  const backend = await renderInbox();
  row("Call the dentist").focus();
  fireEvent.keyDown(row("Call the dentist"), { key: "b", repeat: true });
  fireEvent.keyDown(screen.getByRole("button", { name: "More actions for Call the dentist" }), {
    key: "b",
  });
  await settle();
  expect(argsOf(backend.calls, "inbox_to_task")).toEqual([]);
});

test("undo_restores_note", async () => {
  const backend = await renderInbox();
  row("Call the dentist").focus();
  await act(async () => {
    fireEvent.keyDown(row("Call the dentist"), { key: "b" });
  });
  await settle();
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /Undo/ }));
  });
  await settle();
  expect(argsOf(backend.calls, "task_restore_note")).toEqual([{ taskId: "task-9" }]);
  expect(rowTexts()).toEqual([
    "Email the landlord about the lease",
    "Call the dentist",
    "Try the smaller timer ring",
  ]);
  expect(screen.queryByText("Moved to Board")).not.toBeInTheDocument();
});

test("open_board_navigates", async () => {
  const onNavigate = vi.fn();
  await renderInbox({ onNavigate });
  row("Call the dentist").focus();
  await act(async () => {
    fireEvent.keyDown(row("Call the dentist"), { key: "b" });
  });
  await settle();
  fireEvent.click(screen.getByRole("button", { name: /Open Board/ }));
  expect(onNavigate).toHaveBeenCalledWith("board");
});

test("focus_moves_to_next_row", async () => {
  await renderInbox();
  row("Email the landlord about the lease").focus();
  await act(async () => {
    fireEvent.keyDown(row("Email the landlord about the lease"), { key: "b" });
  });
  await settle();
  expect(row("Call the dentist")).toHaveFocus();
  // The last row falls back to the one before it.
  row("Try the smaller timer ring").focus();
  await act(async () => {
    fireEvent.keyDown(row("Try the smaller timer ring"), { key: "b" });
  });
  await settle();
  expect(row("Call the dentist")).toHaveFocus();
  // The only row falls back to the heading.
  await act(async () => {
    fireEvent.keyDown(row("Call the dentist"), { key: "b" });
  });
  await settle();
  expect(screen.getByRole("heading", { name: "Inbox" })).toHaveFocus();
});

test("a_failed_move_keeps_the_note_and_says_so", async () => {
  await renderInbox({ replies: { inbox_to_task: () => Promise.reject("store") } });
  row("Call the dentist").focus();
  await act(async () => {
    fireEvent.keyDown(row("Call the dentist"), { key: "b" });
  });
  await settle();
  expect(screen.getByText("That didn't move. Try again.")).toBeInTheDocument();
  expect(rowTexts()).toContain("Call the dentist");
  expect(screen.queryByText("Moved to Board")).not.toBeInTheDocument();
});

test("a_move_error_from_the_service_is_not_success", async () => {
  await renderInbox({ replies: { inbox_to_task: () => Promise.reject("noteNotFound") } });
  row("Call the dentist").focus();
  await act(async () => {
    fireEvent.keyDown(row("Call the dentist"), { key: "b" });
  });
  await settle();
  expect(screen.getByText("That didn't move. Try again.")).toBeInTheDocument();
});

test("arrows_rove_focus_with_one_tab_stop", async () => {
  await renderInbox();
  const rows = screen.getAllByRole("listitem");
  expect(rows.map((r) => r.getAttribute("tabindex"))).toEqual(["0", "-1", "-1"]);
  rows[0].focus();
  fireEvent.keyDown(rows[0], { key: "ArrowDown" });
  expect(rows[1]).toHaveFocus();
  expect(rows[1]).toHaveAttribute("tabindex", "0");
  expect(rows[0]).toHaveAttribute("tabindex", "-1");
  fireEvent.keyDown(rows[1], { key: "ArrowUp" });
  expect(rows[0]).toHaveFocus();
  fireEvent.keyDown(rows[0], { key: "ArrowUp" });
  expect(rows[0]).toHaveFocus();
});

test("a_note_from_inbox_changed_leaves_the_stop_on_a_row", async () => {
  await renderInbox();
  await emitInboxChanged(THREE.slice(1));
  expect(screen.getAllByRole("listitem")[0]).toHaveAttribute("tabindex", "0");
});
