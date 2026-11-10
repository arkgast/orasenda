import type { ReactElement } from "react";

export interface TimerStripProps {
  remaining?: string;
  remainingLabel?: string;
  progress?: number;
  mode?: "focus" | "break" | "routine" | "warning" | "paused" | "idle";
  idleLength?: string;
  task?: string;
  stacked?: boolean;
}

export function TimerStrip(_props: TimerStripProps): ReactElement {
  return <div />;
}
