import type { ReactElement } from "react";
import { Frame } from "../../../specimens/Frame.tsx";
import { TimerStrip } from "./timer-strip.tsx";

// Today's time track on the timer-surfaces canvas (a-timer) at 360 x 240.
const TODAY_TIME_TRACK = 52;

const STATES = [
  { mode: "focus", remaining: "18:42", remainingLabel: "18 minutes 42 seconds", progress: 0.25 },
  { mode: "paused", remaining: "12:16", remainingLabel: "12 minutes 16 seconds", progress: 0.51 },
  { mode: "idle", idleLength: "25 min" },
  { mode: "break", remaining: "04:10", remainingLabel: "4 minutes 10 seconds", progress: 0.17 },
  { mode: "warning", remaining: "01:48", remainingLabel: "1 minute 48 seconds", progress: 0.93 },
] as const;

export function TimerStripSpecimen(): ReactElement {
  return (
    <>
      {[360, 640, 1440].flatMap((w) =>
        STATES.map((s) => (
          <Frame key={`${w}-${s.mode}`} state={`timer-strip-${w}-${s.mode}`} width={w} height={64}>
            <TimerStrip {...s} />
          </Frame>
        )),
      )}
      {STATES.map((s) => (
        <Frame
          key={s.mode}
          state={`timer-strip-stacked-360-${s.mode}`}
          width={360}
          height={TODAY_TIME_TRACK}
        >
          <TimerStrip {...s} stacked />
        </Frame>
      ))}
    </>
  );
}
