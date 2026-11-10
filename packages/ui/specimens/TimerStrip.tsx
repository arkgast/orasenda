import type { ReactElement } from "react";
import { TimerStrip } from "../index.ts";
import { Frame } from "./Frame.tsx";

const INTENT = "Finish the chapter 3 outline and send the draft to Maya before the review";

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
            <TimerStrip {...s} task={INTENT} />
          </Frame>
        )),
      )}
      {STATES.map((s) => (
        <Frame key={s.mode} state={`timer-strip-stacked-360-${s.mode}`} width={360} height={190}>
          <TimerStrip {...s} task={INTENT} stacked />
        </Frame>
      ))}
    </>
  );
}
