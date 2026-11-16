import { expect, test } from "vitest";
import { barView, priorityView, reviewView, shutdownView, statsView, weeklyView } from "./review";
import { habitDots } from "./routines";

test("review_fixtures_typecheck", () => {
  // The types are checked by `tsc`; this pins the defaults the screens build on.
  expect(reviewView().primary).toBe("shutdown");
  expect(reviewView({ primary: "weekly" }).primary).toBe("weekly");
  expect(shutdownView().answers.wentWell).toBeNull();
  expect(weeklyView().answers.priorities).toEqual([]);
  expect(barView({ empty: true }).empty).toBe(true);
  expect(priorityView({ done: true }).done).toBe(true);
});

test("stats_habit_dots_come_from_the_routines_dot_builder", () => {
  const [habit] = statsView().habits;
  expect(habit.dots).toEqual(habitDots(["done", "notDone", "done"]));
  expect(statsView({ habits: [{ ...habit, dots: null }] }).habits[0].dots).toBeNull();
});
