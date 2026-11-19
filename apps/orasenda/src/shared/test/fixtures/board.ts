import { act } from "@testing-library/react";
import {
  type BoardNoticeKind,
  type BoardView_Serialize,
  type ColumnView_Serialize,
  events,
  type Lane,
  type TaskView_Serialize,
} from "../../ipc/bindings";

const COLUMNS = [
  ["backlog", "Backlog", null],
  ["today", "Today", 3],
  ["doing", "Doing", 1],
  ["done", "Done", null],
] as const;

/** An empty board with the default columns. */
export const BOARD: BoardView_Serialize = {
  columns: COLUMNS.map(([lane, name, limit]) => ({
    lane,
    name,
    limit,
    custom: false,
    folded: lane === "done",
    count: 0,
    state: "under",
    tasks: [],
  })),
  buffer: 25,
  today: "2026-11-14",
  todayPlanned: 0,
};

export async function emitBoardChanged(seq: number, board: BoardView_Serialize): Promise<void> {
  await act(async () => {
    await events.boardChanged.emit({ seq, board });
  });
}

/** A task as the board shows it; `over` changes any field. */
export function boardTask(
  id: string,
  title: string,
  lane: Lane,
  over: Partial<TaskView_Serialize> = {},
): TaskView_Serialize {
  return {
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
    weekPriority: false,
    ...over,
  };
}

/** A board holding `tasks`, each in its own lane in the order given; counts and limit states follow. */
export function boardOf(
  tasks: TaskView_Serialize[],
  over: Partial<BoardView_Serialize> = {},
): BoardView_Serialize {
  const columns: ColumnView_Serialize[] = BOARD.columns.map((column) => {
    const here = tasks.filter((t) => t.lane === column.lane);
    const limit = column.limit;
    const state =
      limit === null || here.length < limit ? "under" : here.length === limit ? "at" : "over";
    return { ...column, tasks: here, count: here.length, state };
  });
  return { ...BOARD, columns, ...over };
}

export async function emitBoardNotice(kind: BoardNoticeKind, message: string): Promise<void> {
  await act(async () => {
    await events.boardNotice.emit({ kind, message });
  });
}

/**
 * `board` with custom columns put before Done, in the order given. Each holds the tasks of
 * `tasks` that sit in its lane (add them to the board's own tasks by passing `tasks` here).
 */
export function withCustom(
  board: BoardView_Serialize,
  customs: { lane: Lane; name: string; tasks?: TaskView_Serialize[]; folded?: boolean }[],
): BoardView_Serialize {
  const extra: ColumnView_Serialize[] = customs.map((c) => ({
    lane: c.lane,
    name: c.name,
    limit: null,
    custom: true,
    folded: c.folded ?? false,
    count: c.tasks?.length ?? 0,
    state: "under",
    tasks: c.tasks ?? [],
  }));
  const done = board.columns.length - 1;
  return {
    ...board,
    columns: [...board.columns.slice(0, done), ...extra, ...board.columns.slice(done)],
  };
}
