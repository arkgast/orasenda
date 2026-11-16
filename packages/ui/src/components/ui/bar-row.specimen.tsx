import type { ReactElement } from "react";
import { Frame } from "../../../specimens/Frame.tsx";
import { BarList, BarRow } from "./bar-row.tsx";

export function BarRowSpecimen(): ReactElement {
  return (
    <>
      <Frame state="bar-row-plain-420" width={420} height={160}>
        <BarList>
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
        </BarList>
      </Frame>
      <Frame state="bar-row-narrow-360" width={360} height={110}>
        <BarList>
          <BarRow
            label="Deep work on the quarterly planning review"
            minutes={90}
            max={130}
            duration="1h 30m"
            spoken="Deep work on the quarterly planning review, 1 hour 30 minutes"
          />
          <BarRow
            label="● Focus"
            minutes={130}
            max={130}
            duration="2h 10m"
            spoken="Focus, 2 hours 10 minutes"
          />
        </BarList>
      </Frame>
      <Frame state="bar-row-goal-420" width={420} height={100}>
        <BarList>
          <BarRow
            label="Focus"
            minutes={450}
            max={450}
            duration="7h 30m"
            spoken="Focus, 7 hours 30 minutes, goal 12 hours"
            goal={{ minutes: 720, words: "Goal 12h" }}
          />
        </BarList>
      </Frame>
      <Frame state="bar-row-goal-reached-420" width={420} height={100}>
        <BarList>
          <BarRow
            label="Focus"
            minutes={780}
            max={780}
            duration="13h 0m"
            spoken="Focus, 13 hours, goal 12 hours reached"
            goal={{ minutes: 720, words: "Goal 12h, reached" }}
          />
        </BarList>
      </Frame>
    </>
  );
}
