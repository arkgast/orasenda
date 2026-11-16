import { act } from "@testing-library/react";
import type {
  HabitDayState,
  HabitDotView,
  HabitView_Serialize,
  RoutinesView_Serialize,
  RoutineToday,
  RoutineView_Serialize,
  RunStepView,
  RunView_Serialize,
} from "../../ipc/bindings";
import { events } from "../../ipc/bindings";
import type { Replies } from "./index";
import { TEMPLATES } from "./templatesView";

export { TEMPLATES };

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/**
 * A dot grid of `states`, oldest first, the last one today. Labels count back from Saturday
 * 7 November (the Rust fixtures' T0), so they read like Rust's: "Friday 6 November".
 */
export function habitDots(states: HabitDayState[]): HabitDotView[] {
  return states.map((state, index) => {
    const back = states.length - 1 - index;
    const day = 7 - back;
    const weekday = (((5 - back) % 7) + 7) % 7;
    const date = day > 0 ? `${day} November` : `${31 + day} October`;
    return { state, today: back === 0, weekday, label: `${WEEKDAYS[weekday]} ${date}` };
  });
}

/** A habit inside routine `routine-1`, not done today, one week of dots. */
export function habitView(patch: Partial<HabitView_Serialize> = {}): HabitView_Serialize {
  return {
    id: "habit-1",
    routineId: "routine-1",
    name: "Drink a glass of water",
    whenText: null,
    whereText: null,
    anchor: "I wake up",
    twoMinute: "one sip",
    identity: null,
    optional: false,
    days: null,
    daysLabel: null,
    intention: "I will drink a glass of water.",
    anchorLine: "After I wake up, I will drink a glass of water.",
    dots: habitDots(["done", "done", "notDone", "done", "rest", "done", "upcoming"]),
    doneToday: false,
    runLine: "4 days kept",
    freshStart: null,
    ...patch,
  };
}

/** A standalone habit, every day, the fresh-start line showing. */
export function standaloneHabit(patch: Partial<HabitView_Serialize> = {}): HabitView_Serialize {
  return habitView({
    id: "habit-solo",
    routineId: null,
    name: "Stretch",
    anchor: null,
    twoMinute: null,
    days: 127,
    daysLabel: "Every day",
    intention: "I will stretch.",
    anchorLine: null,
    dots: habitDots(["done", "notDone", "notDone", "upcoming"]),
    runLine: null,
    freshStart: "Two days off. Today is a fresh start.",
    ...patch,
  });
}

const TODAY_LINES: Record<RoutineToday, string> = {
  notStarted: "Not started today",
  inProgress: "1 of 2 done today",
  finished: "Done today, 2 of 2",
};

/** A templated routine at 7:00 every day with two habits, `today` as asked. */
export function routineView(
  patch: Partial<RoutineView_Serialize> = {},
  today: RoutineToday = "notStarted",
): RoutineView_Serialize {
  return {
    id: "routine-1",
    name: "Morning Light & Movement",
    timeOfDay: 420,
    time: "07:00",
    days: 127,
    daysLabel: "Every day",
    wellness: true,
    note: "Wellness suggestion, not medical advice. Inspired by Huberman Lab; some steps have limited evidence.",
    habits: [
      habitView({ doneToday: today !== "notStarted" }),
      habitView({
        id: "habit-2",
        name: "Move for 5–10 minutes",
        anchor: null,
        anchorLine: null,
        twoMinute: "ten squats",
        intention: "I will move for 5–10 minutes.",
        doneToday: today === "finished",
      }),
    ],
    today,
    todayLine: TODAY_LINES[today],
    ...patch,
  };
}

/** The Routines page's view: one routine and one standalone habit, no run. */
export function routinesView(patch: Partial<RoutinesView_Serialize> = {}): RoutinesView_Serialize {
  return { routines: [routineView()], habits: [standaloneHabit()], run: null, ...patch };
}

/** No routines and no habits: the empty state. */
export const NO_ROUTINES: RoutinesView_Serialize = { routines: [], habits: [], run: null };

/** A run of `routineView()`, on its first step (for R6 and R8). */
export function runView(patch: Partial<RunView_Serialize> = {}): RunView_Serialize {
  const steps: RunStepView[] = [
    {
      habitId: "habit-1",
      name: "Drink a glass of water",
      detail: [
        "I will drink a glass of water.",
        "After I wake up, I will drink a glass of water.",
        "2-minute version: one sip.",
      ],
      optional: false,
      state: "upcoming",
    },
    {
      habitId: "habit-2",
      name: "Move for 5–10 minutes",
      detail: ["I will move for 5–10 minutes.", "2-minute version: ten squats."],
      optional: false,
      state: "upcoming",
    },
  ];
  return {
    id: "run-1",
    routineId: "routine-1",
    routineName: "Morning Light & Movement",
    steps,
    current: 0,
    done: 0,
    skipped: 0,
    total: 2,
    wellness: true,
    line: "Step 1 of 2",
    ...patch,
  };
}

/** The routines commands' default replies, spread into the mocked backend. */
export const ROUTINES_REPLIES: Replies = {
  routines_list: () => routinesView(),
  routine_templates: () => TEMPLATES,
  routine_create: () => "routine-new",
  routine_add_template: () => "routine-new",
  routine_update: () => null,
  routine_move: () => null,
  routine_remove: () => null,
  routine_restore: () => null,
  habit_create: () => "habit-new",
  habit_update: () => null,
  habit_move: () => null,
  habit_remove: () => null,
  habit_restore: () => null,
  habit_check: () => null,
};

export async function emitRoutinesChanged(view: RoutinesView_Serialize): Promise<void> {
  await act(async () => {
    await events.routinesChanged.emit(view);
  });
}
