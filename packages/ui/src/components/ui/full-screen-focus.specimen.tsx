import type { ReactElement } from "react";
import { Frame } from "../../../specimens/Frame.tsx";
import { FullScreenFocus, type FullScreenFocusProps } from "./full-screen-focus.tsx";

const TASK = "Finish the chapter 3 outline and send the draft to Maya";
const RUN = {
  remaining: "18:42",
  remainingLabel: "18 minutes 42 seconds",
  progress: 0.25,
  task: TASK,
  clock: "09:41",
  onExit: () => {},
  onPause: () => {},
  onResume: () => {},
  onEnd: () => {},
  onStart: () => {},
} satisfies FullScreenFocusProps;

const STATES: Array<[string, Partial<FullScreenFocusProps>]> = [
  ["focus", { mode: "focus" }],
  ["paused", { mode: "paused" }],
  ["idle", { mode: "idle", summary: <p className="m-0 text-body-sm">Classic · ends 15:20</p> }],
  ["break", { mode: "break", remaining: "05:00", remainingLabel: "5 minutes", progress: 0.1 }],
  [
    "warning",
    { mode: "warning", remaining: "01:48", remainingLabel: "1 minute 48 seconds", progress: 0.92 },
  ],
  [
    "ended",
    {
      mode: "idle",
      ended: true,
      summary: <p className="m-0 text-body-sm">Classic · ends 15:20</p>,
    },
  ],
];

// The frames the README names: the two big displays, the strip frame, the window minimum, a phone and an xl desktop.
const SIZES = [
  [1280, 720],
  [1920, 1080],
  [1000, 440],
  [360, 240],
  [390, 844],
  [1440, 900],
] as const;

export function FullScreenFocusSpecimen(): ReactElement {
  return (
    <>
      {SIZES.flatMap(([w, h]) =>
        STATES.map(([name, props]) => (
          <Frame
            key={`${name}-${w}x${h}`}
            state={`full-screen-focus-${name}-${w}x${h}`}
            width={w}
            height={h}
          >
            <FullScreenFocus {...RUN} singleKeys={name === "focus"} {...props} />
          </Frame>
        )),
      )}
    </>
  );
}
