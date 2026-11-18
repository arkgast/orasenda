import { barView, reviewView, weeklyView } from "@shared/test/fixtures/review";
import type { Handler } from "./backend";
import { backend } from "./backend";

export const REVIEW_WEEKLY_SCENARIOS: Record<string, Handler> = {};

const LONG =
  "Plan the quarterly roadmap with every team that depends on the sync service and write it up";

const DAYS = [
  ["Mon", 130],
  ["Tue", 95],
  ["Wed", 0],
  ["Thu", 160],
  ["Fri", 45],
  ["Sat", 0],
  ["Sun", 0],
] as const;

// The weekly flow, each step: a look-back with a goal row, five tasks (one with a long title),
// routine, habit and estimate lines, two days of reflections and last week's improvement
// (reviewWeekly); and a quiet week with nothing recorded (reviewWeeklyEmpty). A save answers with
// the same view, and the completion adds Rust's line, so every step can be walked.
const weeklyBackend = (view: ReturnType<typeof weeklyView>): Handler =>
  backend({
    replies: {
      review_get: () => reviewView({ primary: "weekly" }),
      weekly_get: () => view,
      weekly_save: () => view,
      weekly_complete: () => ({ ...view, completedLine: "Week planned." }),
    },
  });

REVIEW_WEEKLY_SCENARIOS.reviewWeekly = weeklyBackend(
  weeklyView({
    lastImprovement: "Last week you chose: Stop work by five",
    lookBack: {
      heading: "Monday 16 to Sunday 22 November",
      focusLine: "7h 10m of focus this week.",
      days: DAYS.map(([label, minutes]) =>
        barView({
          label,
          minutes,
          spoken: `${label}, ${minutes} minutes`,
          duration: minutes ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : "",
          empty: minutes === 0,
        }),
      ),
      goal: { minutes: 720, words: "Goal 12h", line: "7h 10m of a 12h goal." },
      tasks: [
        barView({ label: "Fix sync bug", minutes: 190, duration: "3h 10m" }),
        barView({ label: LONG, minutes: 120, duration: "2h 00m" }),
        barView({ label: "Write notes", minutes: 60, duration: "1h 00m" }),
        barView({ label: "Call the bank", minutes: 40, duration: "0h 40m" }),
        barView({ label: "Reply to Sam", minutes: 20, duration: "0h 20m" }),
      ],
      tasksLine: "4 tasks done this week.",
      routineLines: ["Wind-down: finished 6 times.", "Morning Light & Movement: finished 4 times."],
      habitLines: ["Drink water: done on 5 days.", "Stretch: done on 3 days."],
      estimateLine:
        "6 finished tasks had an estimate: 14 sessions planned, 17 sessions of 5 minutes or more.",
      reflections: [
        {
          dayLabel: "Monday 16 November",
          lines: ["What went well: A calm start.", `What to improve: ${LONG}.`],
        },
        { dayLabel: "Thursday 19 November", lines: ["Outside my control: The outage."] },
      ],
    },
  }),
);

REVIEW_WEEKLY_SCENARIOS.reviewWeeklyEmpty = weeklyBackend(
  weeklyView({
    lookBack: {
      heading: "Monday 16 to Sunday 22 November",
      focusLine: "Nothing recorded this week.",
      days: DAYS.map(([label]) =>
        barView({
          label,
          minutes: 0,
          spoken: `${label}, nothing recorded`,
          duration: "",
          empty: true,
        }),
      ),
      goal: null,
      tasks: [],
      tasksLine: "No tasks done this week.",
      routineLines: [],
      habitLines: [],
      estimateLine: null,
      reflections: [],
    },
  }),
);

// A weekly review whose saves fail: the improvement step cannot save ("store"), and the
// completion answers TooLong, so the lines sit at the top of a step and next to a picker.
REVIEW_WEEKLY_SCENARIOS.reviewWeeklySaveFails = backend({
  replies: {
    review_get: () => reviewView({ primary: "weekly" }),
    weekly_get: () => weeklyView(),
    weekly_save: () => Promise.reject("store"),
    weekly_complete: () => Promise.reject("tooLong"),
  },
});
