import type { BoardView_Serialize, Lane, TaskView_Serialize } from "../../../shared/ipc/bindings";
import type { Handler } from "./backend";
import { backend } from "./backend";

export const BOARD_SCENARIOS: Record<string, Handler> = {};

// The Board page: a working week, a column over its limit, a very long title, an empty board and
// one that will not load.
const COLUMNS: ReadonlyArray<[Lane, string, number | null]> = [
  ["backlog", "Backlog", null],
  ["today", "Today", 3],
  ["doing", "Doing", 1],
  ["done", "Done", null],
];

const task = (
  id: string,
  title: string,
  lane: Lane,
  over: Partial<TaskView_Serialize> = {},
): TaskView_Serialize => ({
  id,
  title,
  notes: "",
  tags: [],
  kind: "deep",
  estimate: null,
  planned: null,
  due: null,
  dueLabel: null,
  priority: null,
  checklist: [],
  lane,
  isFrog: false,
  breakdownDismissed: false,
  sourceNoteId: null,
  doneAt: null,
  tracked: "0h 00m",
  trackedMs: 0,
  sessions: 0,
  active: false,
  ...over,
});

const board = (tasks: TaskView_Serialize[]): BoardView_Serialize => ({
  columns: COLUMNS.map(([lane, name, limit]) => {
    const here = tasks.filter((t) => t.lane === lane);
    const state =
      limit === null || here.length < limit ? "under" : here.length === limit ? "at" : "over";
    return { lane, name, limit, count: here.length, state, tasks: here };
  }),
  buffer: 25,
  today: "2026-11-14",
  todayPlanned: tasks
    .filter((t) => t.lane === "today")
    .reduce((sum, t) => sum + (t.planned ?? 0), 0),
});

const week = (): TaskView_Serialize[] => [
  ...Array.from({ length: 8 }, (_, i) => task(`b${i}`, `Backlog task ${i + 1}`, "backlog")),
  task("t1", "Write the intro", "today", {
    isFrog: true,
    estimate: 2,
    planned: 3,
    dueLabel: "Due Fri 20 Nov",
    priority: "high",
    tags: ["writing", "client"],
  }),
  task("t2", "Reply to Ana", "today", { kind: "shallow", estimate: 1, planned: 2 }),
  task("t3", "Plan the week", "today", {
    checklist: [{ id: "c1", text: "Pick three", done: true }],
  }),
  task("d1", "Fix the sync bug", "doing", {
    active: true,
    estimate: 3,
    sessions: 1,
    tracked: "0h 50m",
  }),
  task("x1", "Ship the release", "done"),
  task("x2", "Send the invoice", "done"),
];

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
