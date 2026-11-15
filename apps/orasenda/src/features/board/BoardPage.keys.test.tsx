import { argsOf, boardOf, emitBoardChanged, settle } from "@shared/test/fixtures";
import { clearMocks } from "@tauri-apps/api/mocks";
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { card, renderBoard, TASKS } from "./BoardPage.support";

afterEach(async () => {
  cleanup();
  await settle();
  clearMocks();
});

const key = (title: string, init: KeyboardEventInit) => {
  const el = card(title);
  el.focus();
  fireEvent.keyDown(el, init);
};

test("arrow_keys_move_selection_between_columns", async () => {
  await renderBoard();
  card("Draft outline").focus();
  fireEvent.keyDown(card("Draft outline"), { key: "ArrowDown" });
  expect(card("Book dentist")).toHaveFocus();
  fireEvent.keyDown(card("Book dentist"), { key: "ArrowRight" });
  // Same row, clamped to the column: Today's second card.
  expect(card("Reply to Ana")).toHaveFocus();
  fireEvent.keyDown(card("Reply to Ana"), { key: "ArrowRight" });
  expect(card("Fix sync bug")).toHaveFocus();
  // Done is a folded strip: there is nothing to rove into.
  fireEvent.keyDown(card("Fix sync bug"), { key: "ArrowRight" });
  expect(card("Fix sync bug")).toHaveFocus();
  fireEvent.keyDown(card("Fix sync bug"), { key: "ArrowLeft" });
  expect(card("Write intro")).toHaveFocus();
  fireEvent.keyDown(card("Write intro"), { key: "End" });
  expect(card("Reply to Ana")).toHaveFocus();
  fireEvent.keyDown(card("Reply to Ana"), { key: "Home" });
  expect(card("Write intro")).toHaveFocus();
});

test("only the selected card is a tab stop", async () => {
  await renderBoard();
  act(() => card("Write intro").focus());
  expect(card("Write intro")).toHaveAttribute("tabindex", "0");
  expect(card("Book dentist")).toHaveAttribute("tabindex", "-1");
});

test("alt_cmd_right_moves_card_to_next_column", async () => {
  const backend = await renderBoard();
  key("Write intro", { key: "ArrowRight", metaKey: true, altKey: true });
  await settle();
  // To the end of Doing: it holds one card.
  expect(argsOf(backend.calls, "task_move")).toEqual([{ id: "t1", lane: "doing", index: 1 }]);
  expect(screen.getByText("Moved Write intro to Doing.")).toBeInTheDocument();
});

test("alt_cmd_left_from_backlog_does_nothing", async () => {
  const backend = await renderBoard();
  key("Draft outline", { key: "ArrowLeft", metaKey: true, altKey: true });
  await settle();
  expect(argsOf(backend.calls, "task_move")).toEqual([]);
});

test("alt_cmd_down_reorders_within_the_column", async () => {
  const backend = await renderBoard();
  key("Write intro", { key: "ArrowDown", metaKey: true, altKey: true });
  await settle();
  expect(argsOf(backend.calls, "task_move")).toEqual([{ id: "t1", lane: "today", index: 1 }]);
  key("Write intro", { key: "ArrowUp", metaKey: true, altKey: true });
  await settle();
  // Already first: nothing more to send.
  expect(argsOf(backend.calls, "task_move")).toHaveLength(1);
});

test("the card menu moves a card to a column", async () => {
  const backend = await renderBoard();
  fireEvent.click(screen.getByRole("button", { name: "More actions for Write intro" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Move to Backlog" }));
  await settle();
  expect(argsOf(backend.calls, "task_move")).toEqual([{ id: "t1", lane: "backlog", index: 2 }]);
});

test("remove_then_undo_restores", async () => {
  const backend = await renderBoard();
  key("Reply to Ana", { key: "Backspace", metaKey: true });
  await settle();
  expect(argsOf(backend.calls, "task_remove")).toEqual([{ id: "t2" }]);
  expect(screen.getByText("Removed Reply to Ana.")).toBeInTheDocument();
  // Focus lands on a neighbour, never on the page.
  expect(card("Write intro")).toHaveFocus();
  fireEvent.click(screen.getByRole("button", { name: "Undo removing Reply to Ana" }));
  await settle();
  expect(argsOf(backend.calls, "task_restore")).toEqual([{ id: "t2" }]);
  expect(screen.getByText("Brought back Reply to Ana.")).toBeInTheDocument();
});

test("f_toggles_frog_only_with_single_keys_on", async () => {
  const on = await renderBoard({ singleKey: true });
  key("Write intro", { key: "f" });
  await settle();
  expect(argsOf(on.calls, "task_set_frog")).toEqual([{ id: "t1", on: true }]);
  cleanup();
  clearMocks();
  const off = await renderBoard({ singleKey: false });
  key("Write intro", { key: "f" });
  await settle();
  expect(argsOf(off.calls, "task_set_frog")).toEqual([]);
});

test("a Frog that moves says so and Undo puts it back", async () => {
  const backend = await renderBoard({ replies: { task_set_frog: () => "t2" } });
  key("Write intro", { key: "f" });
  await settle();
  expect(screen.getByText("Frog moved to Write intro.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Undo moving the Frog" }));
  await settle();
  expect(argsOf(backend.calls, "task_set_frog")).toEqual([
    { id: "t1", on: true },
    { id: "t2", on: true },
  ]);
});

test("Return opens the task through the seam", async () => {
  const opened: string[] = [];
  await renderBoard({ onOpenTask: (id) => opened.push(id) });
  key("Write intro", { key: "Enter" });
  expect(opened).toEqual(["t1"]);
});

test("cmd_return_starts_a_session", async () => {
  const backend = await renderBoard();
  key("Write intro", { key: "Enter", metaKey: true });
  await settle();
  expect(argsOf(backend.calls, "timer_start")).toHaveLength(1);
});

test("focus follows a card to the column it moved to", async () => {
  await renderBoard();
  key("Write intro", { key: "ArrowRight", metaKey: true, altKey: true });
  await settle();
  const moved = TASKS.map((t) => (t.id === "t1" ? { ...t, lane: "doing" as const } : t));
  await emitBoardChanged(1, boardOf(moved));
  expect(card("Write intro")).toHaveFocus();
});

test("a held remove key removes once", async () => {
  const backend = await renderBoard();
  key("Reply to Ana", { key: "Backspace", metaKey: true });
  fireEvent.keyDown(card("Reply to Ana"), { key: "Backspace", metaKey: true, repeat: true });
  await settle();
  expect(argsOf(backend.calls, "task_remove")).toEqual([{ id: "t2" }]);
});

test("a menu move keeps focus on the moved card", async () => {
  await renderBoard();
  fireEvent.click(screen.getByRole("button", { name: "More actions for Draft outline" }));
  fireEvent.click(await screen.findByRole("menuitem", { name: "Move to Today" }));
  await settle();
  const moved = TASKS.map((t) => (t.id === "b1" ? { ...t, lane: "today" as const } : t));
  await emitBoardChanged(1, boardOf(moved));
  expect(card("Draft outline")).toHaveFocus();
});
