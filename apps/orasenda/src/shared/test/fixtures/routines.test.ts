import { expect, test } from "vitest";
import { habitDots, NO_ROUTINES, routinesView, routineView, TEMPLATES } from "./routines";

test("habit_dots_count_back_from_today", () => {
  const dots = habitDots(["done", "notDone", "upcoming"]);
  expect(dots.map((dot) => dot.label)).toEqual([
    "Thursday 5 November",
    "Friday 6 November",
    "Saturday 7 November",
  ]);
  expect(dots.map((dot) => dot.today)).toEqual([false, false, true]);
  expect(
    habitDots(["rest", "rest", "rest", "rest", "rest", "rest", "rest", "upcoming"])[0].label,
  ).toBe("Saturday 31 October");
});

test("routine_builders_follow_today", () => {
  expect(routineView({}, "finished").todayLine).toBe("Done today, 2 of 2");
  expect(routineView({}, "inProgress").habits.map((habit) => habit.doneToday)).toEqual([
    true,
    false,
  ]);
  expect(routinesView().run).toBeNull();
  expect(NO_ROUTINES.routines).toEqual([]);
  expect(TEMPLATES.map((template) => template.id)).toEqual([
    "morningLight",
    "deepWorkStart",
    "studySession",
    "eveningShutdown",
    "windDown",
  ]);
});
