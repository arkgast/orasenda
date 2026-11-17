import type { TaskPickerOption } from "@orasenda/ui";
import { type BoardView, commands, events } from "@shared/ipc/bindings";
import { subscribe } from "@shared/ipc/subscribe";
import { useEffect, useState } from "react";

const LANES = ["doing", "today", "backlog"] as const;

/** The live tasks that are not Done, each with its column in words. Pure, for tests. */
export function taskOptions(board: BoardView): TaskPickerOption[] {
  return board.columns
    .filter((column) => (LANES as readonly string[]).includes(column.lane))
    .flatMap((column) =>
      column.tasks.map((task) => ({
        id: task.id,
        title: task.title,
        lane: column.lane as TaskPickerOption["lane"],
        laneLabel: column.name,
        frog: task.isFrog || undefined,
        week: task.weekPriority || undefined,
      })),
    );
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
