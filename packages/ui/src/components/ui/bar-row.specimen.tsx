import type { ReactElement } from "react";
import { Frame } from "../../../specimens/Frame.tsx";
import { BarRow } from "./bar-row.tsx";

// The parent list owns the three content-sized columns the rows share.
const LIST = "m-0 grid list-none p-4";
const COLUMNS = { gridTemplateColumns: "auto 1fr auto" };

export function BarRowSpecimen(): ReactElement {
  return (
    <>
      <Frame state="bar-row-plain-420" width={420} height={160}>
        <ul className={LIST} style={COLUMNS}>
          <BarRow
            label="Focus"
            minutes={130}
            max={130}
            duration="2h 10m"
            spoken="Focus, 2 hours 10 minutes"
          />
          <BarRow
            label="Breaks"
            minutes={50}
            max={130}
            duration="0h 50m"
            spoken="Breaks, 50 minutes"
          />
          <BarRow
            label="Admin"
            minutes={35}
            max={130}
            duration="0h 35m"
            spoken="Admin, 35 minutes"
          />
        </ul>
      </Frame>
      <Frame state="bar-row-goal-420" width={420} height={100}>
        <ul className={LIST} style={COLUMNS}>
          <BarRow
            label="Focus"
            minutes={450}
            max={450}
            duration="7h 30m"
            spoken="Focus, 7 hours 30 minutes, goal 12 hours"
            goal={{ minutes: 720, words: "Goal 12h" }}
          />
        </ul>
      </Frame>
      <Frame state="bar-row-goal-reached-420" width={420} height={100}>
        <ul className={LIST} style={COLUMNS}>
          <BarRow
            label="Focus"
            minutes={780}
            max={780}
            duration="13h 0m"
            spoken="Focus, 13 hours, goal 12 hours reached"
            goal={{ minutes: 720, words: "Goal 12h, reached" }}
          />
        </ul>
      </Frame>
    </>
  );
}
