import type { ReactElement } from "react";
import { TimerRing } from "../index.ts";
import { Frame } from "./Frame.tsx";

const TASK = "Finish the chapter 3 outline and send the draft to Maya before the review";
const RUN = { remaining: "18:42", remainingLabel: "18 minutes 42 seconds", progress: 0.25 };

const SIZES: Array<[number, number]> = [
  [160, 160],
  [240, 320],
  [360, 240],
  [560, 560],
  [800, 600],
  [1200, 900],
];

export function TimerRingSpecimen(): ReactElement {
  return (
    <>
      <Frame state="timer-ring-numeric-idle" width={320} height={320}>
        <TimerRing size={280} mode="idle" />
      </Frame>
      <Frame state="timer-ring-numeric-focus" width={320} height={320}>
        <TimerRing size={280} mode="focus" {...RUN} />
      </Frame>
      {SIZES.map(([w, h]) => (
        <Frame key={`${w}x${h}`} state={`timer-ring-fluid-${w}x${h}`} width={w} height={h}>
          <TimerRing size="fluid" mode="focus" {...RUN} task={TASK} />
        </Frame>
      ))}
      <Frame state="timer-ring-fluid-focus" width={400} height={400}>
        <TimerRing size="fluid" mode="focus" {...RUN} task={TASK} />
      </Frame>
      <Frame state="timer-ring-fluid-break" width={400} height={400}>
        <TimerRing
          size="fluid"
          mode="break"
          remaining="04:10"
          remainingLabel="4 minutes 10 seconds"
          progress={0.17}
          task={TASK}
        />
      </Frame>
      <Frame state="timer-ring-fluid-paused" width={400} height={400}>
        <TimerRing
          size="fluid"
          mode="paused"
          remaining="12:16"
          remainingLabel="12 minutes 16 seconds"
          progress={0.51}
          task={TASK}
        />
      </Frame>
      <Frame state="timer-ring-fluid-warning" width={400} height={400}>
        <TimerRing
          size="fluid"
          mode="warning"
          remaining="01:48"
          remainingLabel="1 minute 48 seconds"
          progress={0.93}
          task={TASK}
        />
      </Frame>
      <Frame state="timer-ring-fluid-idle" width={400} height={400}>
        <TimerRing size="fluid" mode="idle" task={TASK} />
      </Frame>
    </>
  );
}
