import type { ReactElement } from "react";
import { Frame } from "../../../specimens/Frame.tsx";
import { FloatingTimer, type FloatingTimerProps } from "./floating-timer.tsx";

const RUN = { remaining: "18:42", remainingLabel: "18 minutes 42 seconds", progress: 0.25 };
const noop = () => {};
const HANDLERS = { onPause: noop, onResume: noop, onStart: noop, onOpen: noop };

const STATES: Array<[string, FloatingTimerProps]> = [
  ["running", { ...RUN, mode: "focus" }],
  ["paused", { ...RUN, mode: "paused" }],
  ["warning", { remaining: "01:48", remainingLabel: "1 minute 48 seconds", mode: "warning" }],
  ["idle", { mode: "idle" }],
  ["ended", { mode: "idle", ended: true }],
  [
    "deep",
    { remaining: "1:30:00", remainingLabel: "1 hour 30 minutes", progress: 0.02, mode: "focus" },
  ],
  ["break", { remaining: "05:00", remainingLabel: "5 minutes", progress: 0.1, mode: "break" }],
  [
    "skip-break",
    {
      remaining: "05:00",
      remainingLabel: "5 minutes",
      progress: 0.1,
      mode: "break",
      onSkipBreak: noop,
    },
  ],
  ["keep-going", { mode: "idle", onKeepGoing: noop, keepGoingName: "Steady Focus" }],
];

// The window sizes the README names: the minimum, the default and the maximum.
const SIZES = [
  [280, 56],
  [280, 64],
  [360, 96],
] as const;

// The desktop behind the panel: plain CSS backgrounds, a light, a mid-grey and a dark wallpaper.
const WALLPAPERS = [
  ["light", "#EDEDED"],
  ["mid", "#808080"],
  ["dark", "#1C1C1E"],
] as const;

export function FloatingTimerSpecimen(): ReactElement {
  return (
    <>
      {WALLPAPERS.map(([wallpaper, background]) => (
        <div
          key={wallpaper}
          data-wallpaper={wallpaper}
          className="flex flex-wrap gap-5 p-5"
          style={{ background }}
        >
          {SIZES.flatMap(([w, h]) =>
            STATES.map(([name, props]) => (
              <Frame
                key={`${name}-${w}x${h}`}
                state={`floating-timer-${wallpaper}-${name}-${w}x${h}`}
                width={w}
                height={h}
              >
                <FloatingTimer {...HANDLERS} {...props} data-tauri-drag-region="" />
              </Frame>
            )),
          )}
        </div>
      ))}
    </>
  );
}
