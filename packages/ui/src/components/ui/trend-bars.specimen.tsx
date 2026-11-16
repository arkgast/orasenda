import type { ReactElement } from "react";
import { Frame } from "../../../specimens/Frame.tsx";
import { type TrendBar, TrendBars } from "./trend-bars.tsx";

const hm = (m: number) => `${Math.floor(m / 60)}h ${m % 60}m`;

function bar(
  label: string,
  spoken: string,
  minutes: number,
  current = false,
  empty = false,
): TrendBar {
  return { label, spoken, minutes, duration: hm(minutes), current, empty };
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const WEEK: TrendBar[] = [150, 95, 210, 130, 0, 0, 0].map((m, i) =>
  bar(
    i === 3 ? "Today" : (DAYS[i] as string),
    i < 4 ? `${DAYS[i]}, ${hm(m)} of focus` : `${DAYS[i]}, not yet`,
    m,
    i === 3,
    i > 3,
  ),
);

const WEEKS_8: TrendBar[] = [0, 0, 540, 610, 480, 700, 560, 320].map((m, i) =>
  bar(
    i === 7 ? "This week" : `${2 + i * 7} Sep`,
    m ? `Week ${i + 1}, ${hm(m)} of focus` : `Week ${i + 1}, nothing recorded`,
    m,
    i === 7,
    m === 0,
  ),
);

const MONTHS_6: TrendBar[] = [1900, 2400, 2100, 2800, 2300, 900].map((m, i) =>
  bar(
    ["Jun", "Jul", "Aug", "Sep", "Oct", "This month"][i] as string,
    `Month ${i + 1}, ${hm(m)}`,
    m,
    i === 5,
  ),
);

const NONE: TrendBar[] = DAYS.map((d, i) =>
  bar(i === 3 ? "Today" : d, `${d}, nothing recorded`, 0, i === 3, true),
);

export function TrendBarsSpecimen(): ReactElement {
  return (
    <>
      <Frame state="trend-bars-week-360" width={360} height={200}>
        <TrendBars bars={WEEK} caption="Focus time, this week" />
      </Frame>
      <Frame state="trend-bars-weeks-goal-360" width={360} height={200}>
        <TrendBars
          bars={WEEKS_8}
          goal={{ minutes: 600, words: "Goal 10h" }}
          caption="Focus time, last 8 weeks"
        />
      </Frame>
      <Frame state="trend-bars-weeks-goal-1440" width={1440} height={200}>
        <TrendBars
          bars={WEEKS_8}
          goal={{ minutes: 600, words: "Goal 10h" }}
          caption="Focus time, last 8 weeks"
        />
      </Frame>
      <Frame state="trend-bars-months-360" width={360} height={200}>
        <TrendBars bars={MONTHS_6} caption="Focus time, last 6 months" />
      </Frame>
      <Frame state="trend-bars-all-empty-360" width={360} height={200}>
        <TrendBars bars={NONE} caption="Focus time, this week" />
      </Frame>
    </>
  );
}
