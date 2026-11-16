import type {
  BarView,
  HabitStat_Serialize,
  PriorityView,
  ReviewView,
  ShutdownView_Serialize,
  StatsView_Serialize,
  WeeklyView_Serialize,
} from "../../ipc/bindings";
import { habitDots } from "./routines";

/** A day's bar: 2h 10m on Tuesday, not today. */
export function barView(over: Partial<BarView> = {}): BarView {
  return {
    label: "Tue",
    spoken: "Tuesday 17 November, 2 hours 10 minutes",
    minutes: 130,
    duration: "2h 10m",
    current: false,
    empty: false,
    ...over,
  };
}

/** A priority that is still in Doing. */
export function priorityView(over: Partial<PriorityView> = {}): PriorityView {
  return {
    taskId: "task-1",
    title: "Fix sync bug",
    done: false,
    line: "Fix sync bug · Doing",
    ...over,
  };
}

/** The overview on a Monday: the shutdown is open and the planned week has one priority. */
export function reviewView(over: Partial<ReviewView> = {}): ReviewView {
  return {
    today: {
      day: "2026-11-16",
      dayLabel: "Monday 16 November",
      done: false,
      line: "Ready when you are.",
    },
    week: {
      weekStart: "2026-11-16",
      label: "Planning the week of 16 November",
      planned: false,
      line: "One priority so far.",
      priorities: [priorityView()],
    },
    primary: "shutdown",
    ...over,
  };
}

/** The guided shutdown with one unfinished task and every answer empty. */
export function shutdownView(over: Partial<ShutdownView_Serialize> = {}): ShutdownView_Serialize {
  return {
    day: "2026-11-16",
    dayLabel: "Monday 16 November",
    unfinished: [{ id: "task-2", title: "Write notes", laneLabel: "Doing", active: false }],
    tomorrow: ["Fix sync bug"],
    answers: { wentWell: null, toImprove: null, outsideControl: null },
    completedLine: null,
    ...over,
  };
}

/** The weekly review with a one-day look-back and no answers. */
export function weeklyView(over: Partial<WeeklyView_Serialize> = {}): WeeklyView_Serialize {
  return {
    weekStart: "2026-11-23",
    label: "Planning the week of 23 November",
    lookBack: {
      heading: "Monday 16 to Friday 20 November",
      focusLine: "2h 10m of focus",
      days: [barView()],
      goal: null,
      tasks: [barView({ label: "Fix sync bug" })],
      tasksLine: "1 task done",
      routineLines: [],
      habitLines: [],
      estimateLine: null,
      reflections: [],
    },
    answers: { improvement: null, notes: null, priorities: [] },
    lastImprovement: null,
    completedLine: null,
    ...over,
  };
}

/** A habit's stat line with its dots (Week range) built by the routines fixture. */
export function habitStat(over: Partial<HabitStat_Serialize> = {}): HabitStat_Serialize {
  return {
    name: "Drink water",
    line: "Done on 2 days this week",
    dots: habitDots(["done", "notDone", "done"]),
    ...over,
  };
}

/** Stats for the Week range: one bar, one habit, no goal and no buffer suggestion. */
export function statsView(over: Partial<StatsView_Serialize> = {}): StatsView_Serialize {
  return {
    range: "week",
    summary: ["2h 10m of focus this week."],
    bars: [barView()],
    goal: null,
    routines: [],
    habits: [habitStat()],
    estimateLine: null,
    buffer: null,
    empty: null,
    ...over,
  };
}
