import { TEMPLATES } from "@shared/test/fixtures/templatesView";
import type {
  HabitDayState,
  HabitView_Serialize,
  RoutinesView_Serialize,
  RoutineView_Serialize,
  RunView_Serialize,
} from "../../../shared/ipc/bindings";
import type { Handler } from "./backend";
import { backend } from "./backend";

export const ROUTINES_SCENARIOS: Record<string, Handler> = {};

// The Routines page: a few routines and habits with 28-day grids (routinesOverview), and none at all
// (routinesEmpty), and the run view on its second step (routinesRun).
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const CYCLE: HabitDayState[] = ["done", "done", "notDone", "done", "rest", "done", "done"];

/** 28 days ending on Saturday 7 November (today, upcoming), labelled as Rust words them. */
const dots = (from = 0) =>
  Array.from({ length: 28 - from }, (_, i) => {
    const back = 27 - from - i;
    const day = 7 - back;
    const weekday = WEEKDAYS[(((5 - back) % 7) + 7) % 7];
    return {
      state: back === 0 ? ("upcoming" as const) : (CYCLE[i % 7] as HabitDayState),
      today: back === 0,
      label: `${weekday} ${day > 0 ? `${day} November` : `${31 + day} October`}`,
    };
  });

const habit = (id: string, name: string, patch: Partial<HabitView_Serialize> = {}) => ({
  id,
  routineId: "routine-1",
  name,
  whenText: null,
  whereText: null,
  anchor: null,
  twoMinute: null,
  identity: null,
  optional: false,
  days: null,
  daysLabel: null,
  intention: `I will ${name.toLowerCase()}.`,
  anchorLine: null,
  dots: dots(),
  doneToday: false,
  runLine: "5 days kept",
  freshStart: null,
  ...patch,
});

const routine = (patch: Partial<RoutineView_Serialize>): RoutineView_Serialize => ({
  id: "routine-1",
  name: "Morning Light & Movement",
  timeOfDay: 420,
  time: "07:00",
  days: 127,
  daysLabel: "Every day",
  wellness: true,
  note: "Wellness suggestion, not medical advice. Inspired by Huberman Lab; some steps have limited evidence.",
  habits: [
    habit("habit-1", "Drink a glass of water", {
      anchorLine: "After I wake up, I will drink a glass of water.",
    }),
    habit("habit-2", "Get outdoor light: 5–10 min, 15–20 if overcast, 30+ if heavily overcast"),
    habit("habit-3", "Electrolytes", { optional: true }),
  ],
  today: "inProgress",
  todayLine: "1 of 3 done today",
  ...patch,
});

const OVERVIEW: RoutinesView_Serialize = {
  routines: [
    routine({}),
    routine({
      id: "routine-2",
      name: "A routine with a very long name that has to wrap inside its card",
      time: null,
      timeOfDay: null,
      daysLabel: "Mon, Wed, Fri",
      wellness: false,
      note: null,
      today: "notStarted",
      todayLine: "Not started today",
    }),
  ],
  habits: [
    habit("habit-solo", "Stretch", {
      routineId: null,
      days: 127,
      daysLabel: "Every day",
      dots: dots(10),
      runLine: null,
      freshStart: "Two days off. Today is a fresh start.",
    }),
  ],
  run: null,
};

/** The first routine's run on step 2 of 3: one done, a long step name and detail to wrap. */
const RUN: RunView_Serialize = {
  id: "run-1",
  routineId: "routine-1",
  routineName: "Morning Light & Movement",
  steps: [
    {
      habitId: "habit-1",
      name: "Drink a glass of water",
      detail: ["2-minute version: one sip."],
      optional: false,
      state: "done",
    },
    {
      habitId: "habit-2",
      name: "Get outdoor light within an hour of waking, even when the sky is grey",
      detail: [
        "I will get outdoor light within an hour of waking.",
        "After I drink a glass of water, I will step outside.",
        "2-minute version: open the door and look at the sky.",
        "The evidence is contested.",
      ],
      optional: true,
      state: "upcoming",
    },
    {
      habitId: "habit-3",
      name: "Move for 5–10 minutes",
      detail: ["2-minute version: ten squats."],
      optional: false,
      state: "upcoming",
    },
  ],
  current: 1,
  done: 1,
  skipped: 0,
  total: 3,
  wellness: true,
  line: "Step 2 of 3",
};

const routinesBackend = (view: RoutinesView_Serialize): Handler =>
  backend({
    replies: {
      run_start: () => view.run ?? RUN,
      run_step: () => view.run ?? RUN,
      run_end: () => ({
        ...(view.run ?? RUN),
        current: null,
        line: "Routine ended. 1 of 3 done today.",
      }),
      routines_list: () => view,
      routine_templates: () => TEMPLATES,
      routine_add_template: () => "routine-new",
      routine_move: () => null,
      habit_move: () => null,
      habit_check: () => null,
    },
  });
ROUTINES_SCENARIOS.routinesOverview = routinesBackend(OVERVIEW);
ROUTINES_SCENARIOS.routinesEmpty = routinesBackend({ routines: [], habits: [], run: null });
ROUTINES_SCENARIOS.routinesRun = routinesBackend({ ...OVERVIEW, run: RUN });
