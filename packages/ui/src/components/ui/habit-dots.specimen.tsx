import type { ReactElement } from "react";
import { Frame } from "../../../specimens/Frame.tsx";
import {
  type HabitDay,
  HabitDots,
  HabitLegend,
  type HabitState,
  HabitWeekdays,
} from "./habit-dots.tsx";

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
// A fixed pattern: weekends rest, one forgiven day, today still upcoming.
const PATTERN: HabitState[] = ["done", "done", "skipped", "done", "done", "rest", "rest"];

function day(i: number, startWeekday: number, state: HabitState, today = false): HabitDay {
  const weekday = (startWeekday + i) % 7;
  return { state, today, weekday, label: `${WEEKDAYS[weekday]} ${i + 1} November` };
}

/** `count` days ending today, the first on `startWeekday` (0 = Monday). */
function record(count: number, startWeekday: number): HabitDay[] {
  return Array.from({ length: count }, (_, i) => {
    const today = i === count - 1;
    const weekday = (startWeekday + i) % 7;
    return day(i, startWeekday, today ? "future" : (PATTERN[weekday] as HabitState), today);
  });
}

/** Twelve kept-pattern days, then two days in a row not done, then today, still upcoming. */
function freshStart(): HabitDay[] {
  const kept = Array.from({ length: 12 }, (_, i) => day(i, 0, PATTERN[i % 7] as HabitState));
  return [...kept, day(12, 0, "skipped"), day(13, 0, "skipped"), day(14, 0, "future", true)];
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
          days={freshStart()}
          restartNote="Two days off. Today is a fresh start."
        />
      </Frame>
      <Frame state="habit-dots-compact-rows-640" width={640} height={260}>
        <div className="flex flex-col gap-2">
          <div className="flex justify-end">
            <HabitWeekdays />
          </div>
          {["Drink a glass of water", "Stretch", "Read one page"].map((name, i) => (
            <div key={name} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
              <div className="text-body">
                <div className="font-semibold">{name}</div>
                <div className="text-body-sm text-ink-muted">
                  Done on {2 - (i % 2)} days this week
                </div>
              </div>
              <HabitDots compact name={name} columns="week" days={record(7 - i, i)} />
            </div>
          ))}
          <HabitLegend />
        </div>
      </Frame>
      <Frame state="habit-dots-wrap-420" width={420} height={160}>
        <HabitDots name="Read" days={record(14, 2)} note="Two minutes: one page" />
      </Frame>
    </>
  );
}
