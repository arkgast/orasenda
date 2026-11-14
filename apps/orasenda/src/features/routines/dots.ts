import type { HabitDay, HabitState } from "@orasenda/ui";
import type { HabitDayState, HabitDotView } from "@shared/ipc/bindings";

const STATES: Record<HabitDayState, HabitState> = {
  done: "done",
  notDone: "skipped",
  rest: "rest",
  upcoming: "future",
};

// Rust words each dot's date as "Monday 9 November" (English only for now). The week layout needs the
// first day's column, and HabitDotView has no weekday field, so it is read from that word. An
// unknown word gives no offset: the grid still shows every dot, just not aligned. A weekday field
// on HabitDotView replaces this: #547.
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function weekdayOf(label: string): number | undefined {
  const index = WEEKDAYS.indexOf(label.split(" ")[0] ?? "");
  return index < 0 ? undefined : index;
}

/** Rust's dots as `HabitDots` days. An unknown state reads as upcoming, never as done. */
export function toHabitDays(dots: HabitDotView[]): HabitDay[] {
  return dots.map((dot, index) => ({
    state: Object.hasOwn(STATES, dot.state) ? STATES[dot.state] : "future",
    today: dot.today,
    label: dot.label,
    weekday: index === 0 ? weekdayOf(dot.label) : undefined,
  }));
}
