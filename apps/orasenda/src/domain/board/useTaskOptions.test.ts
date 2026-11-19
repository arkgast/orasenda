import type { ColumnView_Serialize, TaskView_Serialize } from "@shared/ipc/bindings";
import { BOARD, boardTask } from "@shared/test/fixtures";
import { expect, test } from "vitest";
import { taskOptions } from "./useTaskOptions";

function column(lane: string, name: string, tasks: TaskView_Serialize[]): ColumnView_Serialize {
  return { lane, name, limit: null, count: tasks.length, state: "under", tasks };
}

const task = (id: string, over: Partial<TaskView_Serialize> = {}) =>
  boardTask({ id, title: id, ...over });

const BOARD_WITH_CUSTOM = {
  ...BOARD,
  columns: [
    column("backlog", "Backlog", [task("b")]),
    column("c1", "Ideas", [task("c1a")]),
    column("today", "Today", [task("t", { isFrog: true })]),
    column("doing", "Doing", [task("d")]),
    column("c2", "Waiting", [task("c2a")]),
    column("done", "Done", [task("x")]),
  ],
};

test("task_options_include_custom_columns", () => {
  const options = taskOptions(BOARD_WITH_CUSTOM);
  const ids = options.map((o) => o.id).sort();
  expect(ids).toEqual(["b", "c1a", "c2a", "d", "t"]);
  expect(options.find((o) => o.id === "c1a")?.laneLabel).toBe("Ideas");
  expect(options.find((o) => o.id === "c2a")?.laneLabel).toBe("Waiting");
  expect(options.find((o) => o.id === "t")?.frog).toBe(true);
});

test("task_options_order_closest_to_doing", () => {
  const options = taskOptions(BOARD_WITH_CUSTOM);
  const byOrder = [...options].sort((a, b) => a.order - b.order).map((o) => o.id);
  expect(byOrder).toEqual(["d", "t", "c1a", "c2a", "b"]);
  expect(options.some((o) => o.id === "x")).toBe(false);
});
