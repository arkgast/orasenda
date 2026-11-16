import type { HabitDay, HabitState } from "@orasenda/ui";
import type { HabitDayState, HabitDotView } from "@shared/ipc/bindings";

const STATES: Record<HabitDayState, HabitState> = {
  done: "done",
  notDone: "skipped",
  rest: "rest",
  upcoming: "future",
};

/** Rust's dots as `HabitDots` days. An unknown state reads as upcoming, never as done. */
export function toHabitDays(dots: HabitDotView[]): HabitDay[] {
  return dots.map((dot, index) => ({
    state: Object.hasOwn(STATES, dot.state) ? STATES[dot.state] : "future",
    today: dot.today,
    label: dot.label,
    weekday: index === 0 ? dot.weekday : undefined,
  }));
}
