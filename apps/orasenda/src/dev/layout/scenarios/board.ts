import type { Handler } from "./backend";
import { backend } from "./backend";
import { board, task, week } from "./boardData";

export const BOARD_SCENARIOS: Record<string, Handler> = {};

// The Board page: a working week, a column over its limit, a very long title, an empty board and
// one that will not load.
const boardBackend = (view: () => unknown): Handler =>
  backend({ replies: { board_get: view, task_add: () => task("new", "New", "backlog") } });

BOARD_SCENARIOS.boardWeek = boardBackend(() => board(week()));
BOARD_SCENARIOS.boardOver = boardBackend(() =>
  board([
    ...week(),
    task("t4", "Book the dentist", "today"),
    task("d2", "Review the draft", "doing"),
  ]),
);
BOARD_SCENARIOS.boardLong = boardBackend(() =>
  board([
    task("b1", "Supercalifragilisticexpialidocious".repeat(4), "backlog"),
    task("t1", `${"A task title that goes on and on, ".repeat(8)}`.trim(), "today", {
      estimate: 4,
      planned: 5,
    }),
    task("d1", "Wordy".repeat(60), "doing"),
  ]),
);
BOARD_SCENARIOS.boardEmpty = boardBackend(() => board([]));
BOARD_SCENARIOS.boardUnreadable = boardBackend(() => Promise.reject("store"));

// A board that keeps what is dropped on it, so a real mouse drag shows where the card landed.
{
  const tasks = week();
  const inner = boardBackend(() => board(tasks));
  BOARD_SCENARIOS.boardDrag = (cmd, args) => {
    if (cmd !== "task_move") return inner(cmd, args);
    const { id, lane, index } = args as { id: string; lane: string; index: number };
    const at = tasks.findIndex((t) => t.id === id);
    const [moved] = tasks.splice(at, 1);
    if (!moved) return null;
    moved.lane = lane as typeof moved.lane;
    const here = tasks.filter((t) => t.lane === lane);
    const before = here[index];
    const last = here[here.length - 1];
    if (before) tasks.splice(tasks.indexOf(before), 0, moved);
    else if (last) tasks.splice(tasks.indexOf(last) + 1, 0, moved);
    else tasks.push(moved);
    return null;
  };
}
