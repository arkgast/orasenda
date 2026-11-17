import { resetSettingsQueueForTests } from "@shared/ipc/settingsQueue";
import { argsOf, boardOf, boardTask, IDLE, mockBackend, settle } from "@shared/test/fixtures";
import { stubPaletteDom } from "@shared/test/paletteDom";
import { clearMocks } from "@tauri-apps/api/mocks";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { Palette } from "./Palette";

const BOARD = boardOf([
  boardTask("b", "Plan the week", "backlog"),
  boardTask("t", "Write notes", "today", { isFrog: true }),
  boardTask("d", "Fix the build", "doing"),
]);
const LINKED = { ...IDLE, task: { id: "t", title: "Write notes" } };

beforeEach(() => {
  stubPaletteDom();
  resetSettingsQueueForTests();
});
afterEach(async () => {
  cleanup();
  await settle();
  resetSettingsQueueForTests();
  clearMocks();
  vi.restoreAllMocks();
});

async function open(replies = {}, tasksOnly = false) {
  const backend = mockBackend({ board_get: () => BOARD, ...replies });
  const onClose = vi.fn();
  const onMode = vi.fn();
  render(
    <Palette
      compact={false}
      tasksOnly={tasksOnly}
      onMode={onMode}
      onClose={onClose}
      onNavigate={vi.fn()}
      onImportTasks={vi.fn()}
      onStartFlow={() => {}}
    />,
  );
  await settle();
  return { backend, onClose, onMode };
}

test("choose_task_shows_and_asks_for_task_mode_without_closing", async () => {
  const { onMode, onClose } = await open();
  fireEvent.click(screen.getByRole("option", { name: "Choose a task…" }));
  await settle();
  expect(onMode).toHaveBeenCalledWith("tasks");
  expect(onClose).not.toHaveBeenCalled();
});

test("enter_sets_task", async () => {
  const { backend, onClose } = await open({}, true);
  const options = screen.getAllByRole("option");
  expect(options[0]).toHaveTextContent("Fix the build");
  expect(screen.getByRole("dialog", { name: "Commands" })).toBeInTheDocument();
  fireEvent.keyDown(screen.getByRole("combobox"), { key: "Enter" });
  await settle();
  expect(argsOf(backend.calls, "timer_set_task")).toEqual([{ taskId: "d" }]);
  expect(onClose).toHaveBeenCalled();
});

test("clear_task_calls_set_task_null", async () => {
  const { backend } = await open({ timer_view: () => LINKED });
  fireEvent.click(screen.getByRole("option", { name: "Clear task" }));
  await settle();
  expect(argsOf(backend.calls, "timer_set_task")).toEqual([{ taskId: null }]);
});

test("set_task_failure_shows_line", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const failing = () => {
    throw { kind: "taskNotFound" };
  };
  const { onClose } = await open({ timer_set_task: failing }, true);
  fireEvent.click(screen.getAllByRole("option")[0]);
  await settle();
  expect(screen.getByText("Couldn't choose that task. Please try again.")).toBeInTheDocument();
  expect(onClose).not.toHaveBeenCalled();
  cleanup();
  await open({ timer_view: () => LINKED, timer_set_task: failing });
  fireEvent.click(screen.getByRole("option", { name: "Clear task" }));
  await settle();
  expect(screen.getByText("Couldn't clear the task. Please try again.")).toBeInTheDocument();
});

test("esc_in_task_mode_closes", async () => {
  const { onClose } = await open({}, true);
  fireEvent.keyDown(screen.getByRole("combobox"), { key: "Escape" });
  await settle();
  expect(onClose).toHaveBeenCalled();
});
