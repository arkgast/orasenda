import { habitDots } from "@shared/test/fixtures";
import { expect, test } from "vitest";
import { toHabitDays } from "./dots";

test("states_map_to_shapes_and_unknown_is_upcoming", () => {
  const days = toHabitDays([
    ...habitDots(["done", "notDone", "rest", "upcoming"]),
    { state: "lost" as never, today: false, label: "Sunday 8 November" },
  ]);
  expect(days.map((d) => d.state)).toEqual(["done", "skipped", "rest", "future", "future"]);
});

test("only_the_first_day_carries_its_weekday", () => {
  const days = toHabitDays(habitDots(["done", "done", "upcoming"]));
  // Thursday 5 November … Saturday 7 November.
  expect(days.map((d) => d.weekday)).toEqual([3, undefined, undefined]);
  expect(days[2]).toMatchObject({ today: true, label: "Saturday 7 November" });
});

test("an_unknown_weekday_word_gives_no_offset", () => {
  expect(toHabitDays([{ state: "done", today: false, label: "Lunes 9" }])[0]?.weekday).toBe(
    undefined,
  );
});
