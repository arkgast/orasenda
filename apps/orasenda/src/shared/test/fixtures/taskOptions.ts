import type { TaskPickerOption } from "@orasenda/ui";
import type { ColumnView_Serialize, TaskView_Serialize } from "@shared/ipc/bindings";
import { BOARD, boardTask } from "./board";

const LANES = {
  doing: { name: "Doing", order: 0 },
  today: { name: "Today", order: 1 },
  backlog: { name: "Backlog", order: 2 },
} as const;

/** A task option as `taskOptions` builds it for the default columns. */
export function taskOption(
  id: string,
  title: string,
  lane: keyof typeof LANES,
  frog = false,
): TaskPickerOption {
  const { name, order } = LANES[lane];
  return { id, title, order, laneLabel: name, frog: frog || undefined };
}

function column(lane: string, name: string, tasks: TaskView_Serialize[]): ColumnView_Serialize {
  const custom = /^c\d/.test(lane) || lane.startsWith("c_");
  const folded = lane === "done";
  return { lane, name, limit: null, count: tasks.length, state: "under", tasks, custom, folded };
}

const task = (id: string, lane: string, over: Partial<TaskView_Serialize> = {}) =>
  boardTask(id, id, lane, over);

/** A board with custom columns either side of Doing, for ordering tests. */
export const BOARD_WITH_CUSTOM = {
  ...BOARD,
  columns: [
    column("backlog", "Backlog", [task("b", "backlog")]),
    column("c1", "Ideas", [task("c1a", "c1")]),
    column("today", "Today", [task("t", "today", { isFrog: true })]),
    column("doing", "Doing", [task("d", "doing")]),
    column("c2", "Waiting", [task("c2a", "c2")]),
    column("done", "Done", [task("x", "done")]),
  ],
};
