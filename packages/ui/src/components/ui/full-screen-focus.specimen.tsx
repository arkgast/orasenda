import type { ReactElement } from "react";
import { Frame } from "../../../specimens/Frame.tsx";
import { FullScreenFocus, type FullScreenFocusProps } from "./full-screen-focus.tsx";

const RUN = {
  remaining: "18:42",
  remainingLabel: "18 minutes 42 seconds",
  progress: 0.25,
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
    "status",
    { mode: "idle", status: "Orasenda can't reach the timer. Close this window and try again." },
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

const noop = () => {};
// The host's break actions (E11): each state the issue names, at every frame.
const ACTION_STATES: Array<[string, Partial<FullScreenFocusProps>]> = [
  [
    "plus-ten",
    {
      mode: "warning",
      remaining: "01:48",
      remainingLabel: "1 minute 48 seconds",
      progress: 0.92,
      secondaryActions: [
        { id: "more", label: "+10 min", name: "Add 10 minutes of focus", onSelect: noop },
      ],
    },
  ],
  [
    "skip-break",
    {
      mode: "break",
      remaining: "05:00",
      remainingLabel: "5 minutes",
      progress: 0.1,
      secondaryActions: [{ id: "skip", label: "Skip break", onSelect: noop }],
    },
  ],
  [
    "break-two",
    {
      mode: "break",
      remaining: "05:00",
      remainingLabel: "5 minutes",
      progress: 0.1,
      secondaryActions: [
        {
          id: "extend",
          label: "+10 min",
          name: "Back to focus for 10 more minutes",
          onSelect: noop,
        },
        { id: "skip", label: "Skip break", onSelect: noop },
      ],
    },
  ],
  [
    "break-warning",
    {
      mode: "warning",
      phase: "break",
      remaining: "01:48",
      remainingLabel: "1 minute 48 seconds",
      progress: 0.9,
      secondaryActions: [{ id: "skip", label: "Skip break", onSelect: noop }],
    },
  ],
  [
    "break-paused",
    {
      mode: "paused",
      phase: "break",
      remaining: "03:10",
      remainingLabel: "3 minutes 10 seconds",
      progress: 0.4,
      secondaryActions: [{ id: "skip", label: "Skip break", onSelect: noop }],
    },
  ],
  [
    "take-break",
    { mode: "focus", secondaryActions: [{ id: "break", label: "Take a break", onSelect: noop }] },
  ],
  [
    "keep-going",
    {
      mode: "idle",
      offer: true,
      summary: <p className="m-0 text-body-sm">Steady Focus · ends 15:20</p>,
      secondaryActions: [
        { id: "keep", label: "Keep going", name: "Keep going with Steady Focus", onSelect: noop },
        { id: "stop", label: "Stop here", onSelect: noop },
      ],
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
        [...STATES, ...ACTION_STATES].map(([name, props]) => (
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
