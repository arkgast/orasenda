import type { ReactElement } from "react";
import { Frame } from "../../../specimens/Frame.tsx";
import { Button } from "./button";
import { RoutineStep, type RoutineStepItem } from "./routine-step";

const MORNING: RoutineStepItem[] = [
  { name: "Drink a glass of water", state: "done" },
  { name: "Get outdoor light", state: "upcoming" },
  { name: "Move for 5–10 minutes", state: "upcoming" },
  { name: "Set the Frog and 3 priorities", state: "upcoming" },
  { name: "Delay caffeine 90–120 minutes", state: "upcoming" },
];

function Answer(): ReactElement {
  return (
    <>
      <Button variant="primary">Done</Button>
      <Button>Skip for today</Button>
      <Button variant="ghost">End routine</Button>
    </>
  );
}

export function RoutineStepSpecimen(): ReactElement {
  return (
    <>
      <Frame state="routine-step-running" width={640} height={520}>
        <RoutineStep
          routineName="Morning Light & Movement"
          progressLine="Step 2 of 5"
          step={{
            name: "Get outdoor light",
            detail: [
              "5–10 min, 15–20 if overcast, 30+ if heavily overcast.",
              "Two minutes: step outside the door.",
            ],
          }}
          steps={MORNING}
          actions={<Answer />}
        />
      </Frame>
      <Frame state="routine-step-optional" width={640} height={520}>
        <RoutineStep
          routineName="Morning Light & Movement"
          progressLine="Step 5 of 5"
          step={{
            name: "Delay caffeine 90–120 minutes",
            detail: ["The evidence is contested."],
            optional: true,
          }}
          steps={MORNING.map((s, i) => (i < 4 ? { ...s, state: i === 2 ? "skipped" : "done" } : s))}
          actions={<Answer />}
        />
      </Frame>
      <Frame state="routine-step-finished" width={640} height={480}>
        <RoutineStep
          routineName="Morning Light & Movement"
          step={{ name: "Delay caffeine 90–120 minutes" }}
          steps={MORNING.map((s, i) => ({ ...s, state: i === 2 ? "skipped" : "done" }))}
          finished
          finishedLine="Routine finished. 4 of 5 done today."
          actions={<Button variant="primary">Back to routines</Button>}
        />
      </Frame>
      <Frame state="routine-step-narrow-360" width={360} height={640}>
        <RoutineStep
          routineName="Evening Shutdown"
          progressLine="Step 3 of 4"
          step={{
            name: "Reflect: what went well, what to improve, what was outside your control",
          }}
          steps={[
            { name: "Move unfinished tasks", state: "done" },
            { name: "Preview tomorrow", state: "done" },
            { name: "Reflect", state: "upcoming" },
            { name: "Say “Shutdown complete”", state: "upcoming" },
          ]}
          actions={<Answer />}
        />
      </Frame>
    </>
  );
}
