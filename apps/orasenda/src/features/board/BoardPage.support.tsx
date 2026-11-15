import type { BoardView_Serialize, TaskView_Serialize } from "@shared/ipc/bindings";
import {
  type Backend,
  boardOf,
  boardTask,
  mockBackend,
  type Replies,
  SETTINGS,
  settle,
} from "@shared/test/fixtures";
import { render, screen } from "@testing-library/react";
import { BoardPage } from "./BoardPage";

/** Backlog two, Today two, Doing one, Done one. */
export const TASKS: TaskView_Serialize[] = [
  boardTask("b1", "Draft outline", "backlog"),
  boardTask("b2", "Book dentist", "backlog"),
  boardTask("t1", "Write intro", "today", { estimate: 2, planned: 3 }),
  boardTask("t2", "Reply to Ana", "today"),
  boardTask("d1", "Fix sync bug", "doing", { active: true }),
  boardTask("x1", "Ship release", "done"),
];

type Options = {
  board?: BoardView_Serialize;
  singleKey?: boolean;
  replies?: Replies;
  onOpenTask?: (id: string) => void;
};

export async function renderBoard(options: Options = {}): Promise<Backend> {
  const board = options.board ?? boardOf(TASKS);
  const backend = mockBackend({
    board_get: () => board,
    settings_get: () => ({ ...SETTINGS, singleKey: options.singleKey ?? true }),
    task_add: (args) =>
      boardTask("new", (args as { draft: { title: string } }).draft.title, "backlog"),
    task_move: () => null,
    task_set_frog: () => null,
    task_remove: () => null,
    task_restore: () => null,
    ...options.replies,
  });
  render(<BoardPage onNavigate={() => {}} onOpenTask={options.onOpenTask} />);
  await settle();
  return backend;
}

/** The card's button, by its title (the accessible name starts with it). */
export const card = (title: string) =>
  screen.getByRole("button", { name: new RegExp(`^${title}`) });
