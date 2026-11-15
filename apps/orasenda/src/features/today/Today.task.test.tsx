import {
  argsOf,
  boardOf,
  boardTask,
  emitBoardNotice,
  emitTimer,
  IDLE,
  RUNNING,
  settle,
} from "@shared/test/fixtures";
import { clearMocks } from "@tauri-apps/api/mocks";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { renderToday } from "./Today.support";

afterEach(async () => {
  cleanup();
  await settle();
  clearMocks();
});

const BOARD = boardOf([
  boardTask("b1", "Draft outline", "backlog"),
  boardTask("d1", "Fix sync bug", "doing", { isFrog: true }),
  boardTask("x1", "Ship release", "done"),
]);
const CHOSEN = { id: "d1", title: "Fix sync bug" };

test("today_picker_starts_empty", async () => {
  const { backend } = await renderToday({ board_get: () => BOARD });
  expect(screen.getByRole("button", { name: "Add a task" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Clear task" })).toBeNull();
  expect(argsOf(backend.calls, "timer_set_task")).toEqual([]);
  expect(argsOf(backend.calls, "timer_start")).toEqual([]);
});

test("picking_task_calls_set_task", async () => {
  const { backend } = await renderToday({
    board_get: () => BOARD,
    timer_set_task: () => ({ ...IDLE, task: CHOSEN }),
  });
  fireEvent.click(screen.getByRole("button", { name: "Add a task" }));
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "sync" } });
  // Done tasks are not offered.
  expect(screen.queryByRole("option", { name: /Ship release/ })).toBeNull();
  fireEvent.click(screen.getByRole("option", { name: /Fix sync bug/ }));
  await settle();
  expect(argsOf(backend.calls, "timer_set_task")).toEqual([{ taskId: "d1" }]);
});

test("clear_calls_set_task_null", async () => {
  const { backend } = await renderToday({
    board_get: () => BOARD,
    timer_state: () => ({ view: { ...RUNNING, task: CHOSEN }, pending: [] }),
    timer_set_task: () => ({ ...RUNNING, task: null }),
  });
  fireEvent.click(screen.getByRole("button", { name: "Clear task" }));
  await settle();
  expect(argsOf(backend.calls, "timer_set_task")).toEqual([{ taskId: null }]);
  await emitTimer({ ...RUNNING, task: null });
  expect(screen.queryByRole("button", { name: "Clear task" })).toBeNull();
});

test("clear_task_returns_focus_to_add_a_task", async () => {
  await renderToday({
    board_get: () => BOARD,
    timer_state: () => ({ view: { ...RUNNING, task: CHOSEN }, pending: [] }),
    timer_set_task: () => ({ ...RUNNING, task: null }),
  });
  const clear = screen.getByRole("button", { name: "Clear task" });
  clear.focus();
  fireEvent.click(clear);
  await settle();
  await emitTimer({ ...RUNNING, task: null });
  expect(screen.getByRole("button", { name: "Add a task" })).toHaveFocus();
});

test("today_shows_task_once", async () => {
  await renderToday({
    board_get: () => BOARD,
    timer_state: () => ({ view: { ...RUNNING, task: CHOSEN }, pending: [] }),
  });
  expect(screen.getByRole("button", { name: /Task: Fix sync bug/ })).toBeInTheDocument();
  expect(screen.getByRole("timer")).not.toHaveAccessibleName(/Fix sync bug/);
  expect(screen.getAllByText("Fix sync bug")).toHaveLength(1);
});

test("board_notice_shows_line", async () => {
  await renderToday({ board_get: () => BOARD });
  await emitBoardNotice("movedBack", "Moved Fix sync bug back to Today.");
  expect(screen.getByText("Moved Fix sync bug back to Today.")).toBeInTheDocument();
});

test("board_notice_not_saved_reads_as_attention", async () => {
  await renderToday({ board_get: () => BOARD });
  await emitBoardNotice("notSaved", "The board didn't update. Try again.");
  const line = screen.getByText("The board didn't update. Try again.");
  expect(line.closest("[data-slot=inline-notice]")).toHaveAttribute("data-tone", "attention");
  await emitBoardNotice("movedBack", "Moved Fix sync bug back to Today.");
  const moved = screen.getByText("Moved Fix sync bug back to Today.");
  expect(moved.closest("[data-slot=inline-notice]")).toHaveAttribute("data-tone", "neutral");
});
