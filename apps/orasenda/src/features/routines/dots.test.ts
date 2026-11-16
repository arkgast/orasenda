import { habitDots } from "@shared/test/fixtures";
import { expect, test } from "vitest";
import { toHabitDays } from "./dots";

test("states_map_to_shapes_and_unknown_is_upcoming", () => {
  const days = toHabitDays([
    ...habitDots(["done", "notDone", "rest", "upcoming"]),
    { state: "lost" as never, today: false, label: "Sunday 8 November", weekday: 6 },
  ]);
  expect(days.map((d) => d.state)).toEqual(["done", "skipped", "rest", "future", "future"]);
});

test("only_the_first_day_carries_its_weekday", () => {
  const days = toHabitDays(habitDots(["done", "done", "upcoming"]));
  // Thursday 5 November … Saturday 7 November.
  expect(days.map((d) => d.weekday)).toEqual([3, undefined, undefined]);
  expect(days[2]).toMatchObject({ today: true, label: "Saturday 7 November" });
});

test("first_column_from_weekday_field", () => {
  const days = toHabitDays([{ state: "done", today: false, label: "x", weekday: 4 }]);
  expect(days[0]?.weekday).toBe(4);
});

test("non_english_label_still_aligns", () => {
  const days = toHabitDays([
    { state: "done", today: false, label: "lunes 9 de noviembre", weekday: 0 },
  ]);
  expect(days[0]?.weekday).toBe(0);
  expect(days[0]?.label).toBe("lunes 9 de noviembre");
});
