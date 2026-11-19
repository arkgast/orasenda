import type { TaskPickerOption } from "@orasenda/ui";
import { type BoardView, commands, events } from "@shared/ipc/bindings";
import { subscribe } from "@shared/ipc/subscribe";
import { useEffect, useState } from "react";

/** Where each live column sorts: Doing first, the columns before it nearest first, then those after it, Backlog last. */
function columnOrder(columns: BoardView["columns"]): Map<string, number> {
  const open = columns.filter((c) => c.lane !== "done");
  const doing = open.findIndex((c) => c.lane === "doing");
  const middle = (cs: typeof open) => cs.filter((c) => c.lane !== "backlog" && c.lane !== "doing");
  const sequence =
    doing < 0
      ? open
      : [
          open[doing],
          ...middle(open.slice(0, doing)).reverse(),
          ...middle(open.slice(doing + 1)),
          ...open.filter((c) => c.lane === "backlog"),
        ];
  return new Map(sequence.map((column, index) => [column?.lane ?? "", index]));
}

/** The live tasks that are not Done, each with its column in words and its sort key. Pure, for tests. */
export function taskOptions(board: BoardView): TaskPickerOption[] {
  const order = columnOrder(board.columns);
  return board.columns.flatMap((column) => {
    const at = order.get(column.lane);
    if (at === undefined) return [];
    return column.tasks.map((task) => ({
      id: task.id,
      title: task.title,
      order: at,
      laneLabel: column.name,
      frog: task.isFrog || undefined,
      week: task.weekPriority || undefined,
    }));
  });
}

/**
 * The options for a `TaskPicker`: one `board_get`, then every `board-changed`, the newest `seq`
 * winning. If the board can't be read the list is empty and the failure is logged; the picker is
 * optional, so Today stays usable without it.
 */
export function useTaskOptions(): TaskPickerOption[] {
  const [options, setOptions] = useState<TaskPickerOption[]>([]);
  useEffect(() => {
    let cancelled = false;
    let newest = 0;
    const stop = subscribe("board-changed", events.boardChanged.listen, ({ seq, board }) => {
      if (seq <= newest) return;
      newest = seq;
      setOptions(taskOptions(board));
    });
    const seen = newest;
    commands.boardGet().then(
      (result) => {
        if (cancelled || newest !== seen) return;
        if (result.status === "ok") setOptions(taskOptions(result.data));
        else console.error("board_get failed", result.error);
      },
      (error: unknown) => console.error("board_get failed", error),
    );
    return () => {
      cancelled = true;
      stop();
    };
  }, []);
  return options;
}
