import type { ReactElement } from "react";
import { Frame } from "../../../specimens/Frame.tsx";
import { type TrendBar, TrendBars } from "./trend-bars.tsx";

const hm = (m: number) => `${Math.floor(m / 60)}h ${m % 60}m`;

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_WORDS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const words = (m: number) => {
  const h = Math.floor(m / 60);
  const r = m % 60;
  return [h ? `${h} ${h === 1 ? "hour" : "hours"}` : "", r ? `${r} minutes` : ""]
    .filter(Boolean)
    .join(" ");
};
const WEEK: TrendBar[] = [150, 95, 210, 130, 70, 0, 0].map((m, i) => {
  const empty = i > 4;
  const name = i === 4 ? `Today, ${DAY_WORDS[i]}` : (DAY_WORDS[i] as string);
  return {
    label: i === 4 ? "Today" : (DAYS[i] as string),
    spoken: empty ? `${name}, not yet` : `${name}, ${words(m)}`,
    minutes: m,
    duration: empty ? "" : hm(m),
    current: i === 4,
    empty,
  };
});

const STARTS = ["14 Sep", "21 Sep", "28 Sep", "5 Oct", "12 Oct", "19 Oct", "26 Oct", "This week"];
const WEEKS_8: TrendBar[] = [0, 0, 540, 610, 480, 700, 560, 320].map((m, i) => ({
  label: STARTS[i] as string,
  spoken:
    m === 0
      ? `Week of ${STARTS[i]}, nothing recorded`
      : `${i === 7 ? "This week" : `Week of ${STARTS[i]}`}, ${words(m)}`,
  minutes: m,
  duration: m ? hm(m) : "",
  current: i === 7,
  empty: m === 0,
}));

const MONTH_NAMES = ["June", "July", "August", "September", "October"];
const MONTHS_6: TrendBar[] = [1900, 2400, 2100, 2800, 2300, 900].map((m, i) => ({
  label: ["Jun", "Jul", "Aug", "Sep", "Oct", "This month"][i] as string,
  spoken: `${i === 5 ? "This month" : MONTH_NAMES[i]}, ${words(m)}`,
  minutes: m,
  duration: hm(m),
  current: i === 5,
  empty: false,
}));

const NONE: TrendBar[] = DAYS.map((d, i) => ({
  label: i === 3 ? "Today" : d,
  spoken: `${i === 3 ? `Today, ${DAY_WORDS[i]}` : DAY_WORDS[i]}, nothing recorded`,
  minutes: 0,
  duration: "",
  current: i === 3,
  empty: true,
}));

export function TrendBarsSpecimen(): ReactElement {
  return (
    <>
      <Frame state="trend-bars-week-240" width={240} height={220}>
        <TrendBars bars={WEEK} caption="Focus time, this week" />
      </Frame>
      <Frame state="trend-bars-weeks-goal-240" width={240} height={220}>
        <TrendBars
          bars={WEEKS_8}
          goal={{ minutes: 600, words: "Goal 10h" }}
          caption="Focus time, last 8 weeks"
        />
      </Frame>
      <Frame state="trend-bars-week-360" width={360} height={220}>
        <TrendBars bars={WEEK} caption="Focus time, this week" />
      </Frame>
      <Frame state="trend-bars-weeks-goal-360" width={360} height={220}>
        <TrendBars
          bars={WEEKS_8}
          goal={{ minutes: 600, words: "Goal 10h" }}
          caption="Focus time, last 8 weeks"
        />
      </Frame>
      <Frame state="trend-bars-weeks-goal-1440" width={1440} height={220}>
        <TrendBars
          bars={WEEKS_8}
          goal={{ minutes: 600, words: "Goal 10h" }}
          caption="Focus time, last 8 weeks"
        />
      </Frame>
      <Frame state="trend-bars-week-1440" width={1440} height={220}>
        <TrendBars bars={WEEK} caption="Focus time, this week" />
      </Frame>
      <Frame state="trend-bars-months-1440" width={1440} height={220}>
        <TrendBars bars={MONTHS_6} caption="Focus time, last 6 months" />
      </Frame>
      <Frame state="trend-bars-months-360" width={360} height={220}>
        <TrendBars bars={MONTHS_6} caption="Focus time, last 6 months" />
      </Frame>
      <Frame state="trend-bars-all-empty-360" width={360} height={220}>
        <TrendBars bars={NONE} caption="Focus time, this week" />
      </Frame>
    </>
  );
}
