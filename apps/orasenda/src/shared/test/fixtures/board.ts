import type { TaskPickerOption } from "@orasenda/ui";
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

const LANE_NAMES = { doing: "Doing", today: "Today", backlog: "Backlog" } as const;

/** A task option as `taskOptions` builds it for a palette or picker. */
export function taskOption(
  id: string,
  title: string,
  lane: keyof typeof LANE_NAMES,
  frog = false,
): TaskPickerOption {
  return { id, title, lane, laneLabel: LANE_NAMES[lane], frog: frog || undefined };
}
