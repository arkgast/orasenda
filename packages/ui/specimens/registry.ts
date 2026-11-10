import type { ReactElement } from "react";
import { KbdSpecimen } from "../src/components/ui/kbd.specimen.tsx";
import { NavRailSpecimen } from "../src/components/ui/nav-rail.specimen.tsx";
import { IconButtonSpecimen } from "./IconButton.tsx";
import { PopoverMenuSpecimen } from "./PopoverMenu.tsx";
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
  NavRail: NavRailSpecimen,
  TimerRing: TimerRingSpecimen,
  TimerStrip: TimerStripSpecimen,
  StartButton: StartButtonSpecimen,
  PopoverMenu: PopoverMenuSpecimen,
};
