import type { ReactElement } from "react";
import { Frame } from "../../../specimens/Frame.tsx";
import { SeededOverflowFrame, ViewportFrame } from "../../../specimens/Harness.tsx";
import { InlineNotice } from "../../index.ts";
import { TimerRing } from "./timer-ring.tsx";

const RUN = { remaining: "18:42", remainingLabel: "18 minutes 42 seconds", progress: 0.25 };

const SIZES: Array<[number, number]> = [
  [160, 160],
  [240, 320],
  [360, 240],
  [560, 560],
  [800, 600],
  [1200, 900],
];

const LONG = {
  remaining: "1:29:59",
  remainingLabel: "1 hour 29 minutes 59 seconds",
  progress: 0.25,
};
const LONG_SIZES: Array<[number, number]> = [
  SIZES[0] as [number, number],
  SIZES[SIZES.length - 1] as [number, number],
];

export function TimerRingSpecimen(): ReactElement {
  return (
    <>
      {/* The harness seed: a ring and the widest status row at 360 wide, plus one frame that overflows on purpose. */}
      <Frame state="timer-ring-focus" width={360} height={300}>
        <TimerRing mode="focus" remaining="25:00" progress={0.4} />
      </Frame>
      <Frame state="inline-notice-row-attention" width={360} height={44}>
        <InlineNotice
          variant="row"
          tone="attention"
          actionLabel="Open Settings"
          actionName="Open Settings to change custom minutes"
          onAction={() => {}}
        >
          Focus didn't start. Custom focus needs 5 to 180 minutes.
        </InlineNotice>
      </Frame>
      <SeededOverflowFrame />
      {/* A slot that follows the viewport: the 390 x 844 and 1440 x 900 cases read it. */}
      <ViewportFrame state="timer-ring-viewport">
        <TimerRing size="fluid" mode="focus" {...RUN} clock="09:41" />
      </ViewportFrame>
      <Frame state="timer-ring-numeric-idle" width={320} height={320}>
        <TimerRing size={280} mode="idle" />
      </Frame>
      <Frame state="timer-ring-numeric-focus" width={320} height={320}>
        <TimerRing size={280} mode="focus" {...RUN} />
      </Frame>
      {SIZES.map(([w, h]) => (
        <Frame key={`${w}x${h}`} state={`timer-ring-fluid-${w}x${h}`} width={w} height={h}>
          <TimerRing size="fluid" mode="focus" {...RUN} />
        </Frame>
      ))}
      <Frame state="timer-ring-fluid-focus" width={400} height={400}>
        <TimerRing size="fluid" mode="focus" {...RUN} />
      </Frame>
      <Frame state="timer-ring-fluid-long" width={400} height={400}>
        <TimerRing size="fluid" mode="focus" {...LONG} />
      </Frame>
      {LONG_SIZES.map(([w, h]) => (
        <Frame
          key={`long-${w}x${h}`}
          state={`timer-ring-fluid-long-${w}x${h}`}
          width={w}
          height={h}
        >
          <TimerRing size="fluid" mode="focus" {...LONG} />
        </Frame>
      ))}
      <Frame state="timer-ring-numeric-long" width={320} height={320}>
        <TimerRing size={280} mode="focus" {...LONG} />
      </Frame>
      <Frame state="timer-ring-full-long" width={600} height={600}>
        <TimerRing size={560} mode="focus" {...LONG} />
      </Frame>
      <Frame state="timer-ring-full-short" width={600} height={600}>
        <TimerRing size={560} mode="focus" remaining="25:00" progress={0.25} />
      </Frame>
      <Frame state="timer-ring-fluid-break" width={400} height={400}>
        <TimerRing
          size="fluid"
          mode="break"
          remaining="04:10"
          remainingLabel="4 minutes 10 seconds"
          progress={0.17}
        />
      </Frame>
      <Frame state="timer-ring-fluid-paused" width={400} height={400}>
        <TimerRing
          size="fluid"
          mode="paused"
          remaining="12:16"
          remainingLabel="12 minutes 16 seconds"
          progress={0.51}
        />
      </Frame>
      <Frame state="timer-ring-fluid-warning" width={400} height={400}>
        <TimerRing
          size="fluid"
          mode="warning"
          remaining="01:48"
          remainingLabel="1 minute 48 seconds"
          progress={0.93}
        />
      </Frame>
      <Frame state="timer-ring-fluid-idle" width={400} height={400}>
        <TimerRing size="fluid" mode="idle" />
      </Frame>
    </>
  );
}
