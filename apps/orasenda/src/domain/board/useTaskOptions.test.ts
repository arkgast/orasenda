import { BOARD_WITH_CUSTOM } from "@shared/test/fixtures";
import { expect, test } from "vitest";
import { taskOptions } from "./useTaskOptions";

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
