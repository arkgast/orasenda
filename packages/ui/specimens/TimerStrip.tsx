import type { ReactElement } from "react";
import { TimerStrip } from "../index.ts";
import { Frame } from "./Frame.tsx";

const SHORT = "Finish the chapter 3 outline and send the draft to Maya before the review";
const MEDIUM = `${SHORT} meeting on Thursday afternoon, then list the open questions for the editor`;
const LONG = `${MEDIUM} and note which figures still need a source before the next draft goes out to the whole group for comments and a second read by the editor in the morning`;

// Each width gets an intent that runs to two lines, never one, never three.
const INTENT: Record<number, string> = { 360: SHORT, 640: MEDIUM, 1440: LONG };

// Today's time track on the timer-surfaces canvas (a-timer) at 360 x 240; the stacked strip takes no task.
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
          <Frame key={`${w}-${s.mode}`} state={`timer-strip-${w}-${s.mode}`} width={w} height={150}>
            <TimerStrip {...s} task={INTENT[w]} />
          </Frame>
        )),
      )}
      {[360, 640, 1440].map((w) => (
        <Frame key={`long-${w}`} state={`timer-strip-long-${w}`} width={w} height={150}>
          <TimerStrip {...STATES[0]} task={`${INTENT[w]} ${LONG} ${LONG}`} />
        </Frame>
      ))}
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
