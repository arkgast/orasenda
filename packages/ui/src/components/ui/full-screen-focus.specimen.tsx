import type { ReactElement } from "react";
import { Frame } from "../../../specimens/Frame.tsx";
import { FullScreenFocus } from "./full-screen-focus.tsx";

const RUN = {
  mode: "focus",
  remaining: "18:42",
  remainingLabel: "18 minutes 42 seconds",
  progress: 0.25,
  task: "Finish the chapter 3 outline and send the draft to Maya",
  clock: "09:41",
  onExit: () => {},
} as const;

// The window sizes the README names: a phone, the window minimum and a large display.
const SIZES = [
  [390, 844],
  [800, 600],
  [1440, 900],
] as const;

export function FullScreenFocusSpecimen(): ReactElement {
  return (
    <>
      {SIZES.map(([w, h]) => (
        <Frame key={`${w}x${h}`} state={`full-screen-focus-${w}x${h}`} width={w} height={h}>
          <FullScreenFocus {...RUN} />
        </Frame>
      ))}
      <Frame state="full-screen-focus-paused-1440x900" width={1440} height={900}>
        <FullScreenFocus {...RUN} mode="paused" />
      </Frame>
    </>
  );
}
