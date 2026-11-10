import type { ReactElement } from "react";
import { IconButtonSpecimen } from "./IconButton.tsx";
import { KbdSpecimen } from "./Kbd.tsx";
import { Seed } from "./Seed.tsx";
import { StartButtonSpecimen } from "./StartButton.tsx";
import { TimerRingSpecimen } from "./TimerRing.tsx";
import { TimerStripSpecimen } from "./TimerStrip.tsx";
import { TooltipSpecimen } from "./Tooltip.tsx";

export const specimens: Record<string, () => ReactElement> = {
  Seed,
  IconButton: IconButtonSpecimen,
  Tooltip: TooltipSpecimen,
  Kbd: KbdSpecimen,
  TimerRing: TimerRingSpecimen,
  TimerStrip: TimerStripSpecimen,
  StartButton: StartButtonSpecimen,
};
