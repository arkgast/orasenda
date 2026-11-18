import type { ReactElement } from "react";
import { Frame } from "../../../specimens/Frame.tsx";
import { Button } from "./button.tsx";
import { RoutineCard } from "./routine-card.tsx";
import { RoutineItem } from "./routine-item.tsx";
import { WellnessNote } from "./wellness-note.tsx";

const STEPS = [
  { label: "Open the curtains", detail: "After I wake up" },
  { label: "Drink a glass of water", detail: "Two minutes: one sip" },
  { label: "Walk outside", detail: "Ten minutes in daylight", optional: true },
];

/** `done` ticks the first n steps; `skipped` marks the rest as Skipped (a finished routine). */
function Steps({ done = 0, skipped = false }: { done?: number; skipped?: boolean }): ReactElement {
  return (
    <>
      {STEPS.map((s, i) => (
        <RoutineItem
          key={s.label}
          done={i < done}
          skipped={skipped && i >= done}
          label={s.label}
          detail={s.detail}
          optional={s.optional}
          readOnly
        />
      ))}
    </>
  );
}

export function RoutineCardSpecimen(): ReactElement {
  return (
    <>
      <Frame state="routine-card-not-started-420" width={420} height={420}>
        <RoutineCard
          name="Morning Light & Movement"
          meta="07:00 · Every day"
          today="notStarted"
          todayLine="Not started today"
          actions={<Button variant="quiet">Start</Button>}
          footer={<WellnessNote />}
        >
          <Steps />
        </RoutineCard>
      </Frame>
      <Frame state="routine-card-in-progress-420" width={420} height={420}>
        <RoutineCard
          name="Deep Work Start"
          meta="09:00 · Weekdays"
          today="inProgress"
          todayLine="2 of 5 done today"
          actions={<Button variant="quiet">Continue</Button>}
        >
          <Steps done={2} />
        </RoutineCard>
      </Frame>
      <Frame state="routine-card-finished-360" width={360} height={460}>
        <RoutineCard
          name="Evening Shutdown, a long name that wraps onto a second line"
          meta="17:30 · Weekdays"
          today="finished"
          todayLine="Done today, 4 of 5"
          actions={<Button variant="quiet">Start</Button>}
          footer={<WellnessNote />}
        >
          <Steps done={2} skipped />
        </RoutineCard>
      </Frame>
      <Frame state="routine-card-bare-900" width={900} height={160}>
        <RoutineCard name="Wind-down" today="notStarted" />
      </Frame>
    </>
  );
}
