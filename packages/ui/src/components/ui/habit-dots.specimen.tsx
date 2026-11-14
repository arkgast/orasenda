import type { ReactElement } from "react";
import { Frame } from "../../../specimens/Frame.tsx";
import { type HabitDay, HabitDots, type HabitState } from "./habit-dots.tsx";

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
// A fixed pattern: weekends rest, one forgiven day, today still upcoming.
const PATTERN: HabitState[] = ["done", "done", "skipped", "done", "done", "rest", "rest"];

/** `count` days ending today, the first on `startWeekday` (0 = Monday). */
function record(count: number, startWeekday: number): HabitDay[] {
  return Array.from({ length: count }, (_, i) => {
    const weekday = (startWeekday + i) % 7;
    const today = i === count - 1;
    return {
      state: today ? "future" : (PATTERN[weekday] as HabitState),
      today,
      weekday,
      label: `${WEEKDAYS[weekday]} ${i + 1} November`,
    };
  });
}

export function HabitDotsSpecimen(): ReactElement {
  return (
    <>
      <Frame state="habit-dots-week-28-360" width={360} height={300}>
        <HabitDots
          name="Drink a glass of water"
          columns="week"
          days={record(28, 0)}
          runLine="5 days kept"
          legend
        />
      </Frame>
      <Frame state="habit-dots-week-offset-360" width={360} height={260}>
        <HabitDots name="Walk outside" columns="week" days={record(24, 3)} runLine="3 days kept" />
      </Frame>
      <Frame state="habit-dots-week-fresh-start-360" width={360} height={260}>
        <HabitDots
          name="Stretch"
          columns="week"
          days={[
            ...record(12, 0),
            { state: "skipped", weekday: 5, label: "Saturday 13 November" },
            { state: "future", today: true, weekday: 6, label: "Sunday 14 November" },
          ]}
          restartNote="Two days off. Today is a fresh start."
        />
      </Frame>
      <Frame state="habit-dots-wrap-420" width={420} height={160}>
        <HabitDots name="Read" days={record(14, 2)} note="Two minutes: one page" />
      </Frame>
    </>
  );
}
