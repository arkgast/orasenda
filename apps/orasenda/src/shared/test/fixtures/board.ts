import { act } from "@testing-library/react";
import { type BoardView_Serialize, events } from "../../ipc/bindings";

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
