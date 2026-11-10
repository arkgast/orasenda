import type { ReactElement } from "react";

export type HabitState = "done" | "skipped" | "rest" | "future";
export interface HabitDotsProps {
  name?: string;
  days: Array<{ state: HabitState; today?: boolean; label?: string } | HabitState>;
  note?: string;
  legend?: boolean;
  restartNote?: string;
}

export function HabitDots(_props: HabitDotsProps): ReactElement {
  return <div />;
}
