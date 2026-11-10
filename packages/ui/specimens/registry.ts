import type { ReactElement } from "react";
import { CapturePadSpecimen } from "../src/components/ui/capture-pad.specimen.tsx";
import { DialogSpecimen } from "../src/components/ui/dialog.specimen.tsx";
import { IconButtonSpecimen } from "../src/components/ui/icon-button.specimen.tsx";
import { KbdSpecimen } from "../src/components/ui/kbd.specimen.tsx";
import { MenuBarTimerSpecimen } from "../src/components/ui/menu-bar-timer.specimen.tsx";
import { NavRailSpecimen } from "../src/components/ui/nav-rail.specimen.tsx";
import { PageFrameSpecimen } from "../src/components/ui/page-frame.specimen";
import { PopoverMenuSpecimen } from "../src/components/ui/popover-menu.specimen";
import { StartButtonSpecimen } from "../src/components/ui/start-button.specimen";
import { TimerRingSpecimen } from "../src/components/ui/timer-ring.specimen.tsx";
import { TimerStripSpecimen } from "../src/components/ui/timer-strip.specimen.tsx";
import { TooltipSpecimen } from "../src/components/ui/tooltip.specimen";

export const specimens: Record<string, () => ReactElement> = {
  IconButton: IconButtonSpecimen,
  Tooltip: TooltipSpecimen,
  Kbd: KbdSpecimen,
  Dialog: DialogSpecimen,
  CapturePad: CapturePadSpecimen,
  NavRail: NavRailSpecimen,
  PageFrame: PageFrameSpecimen,
  MenuBarTimer: MenuBarTimerSpecimen,
  TimerRing: TimerRingSpecimen,
  TimerStrip: TimerStripSpecimen,
  StartButton: StartButtonSpecimen,
  PopoverMenu: PopoverMenuSpecimen,
};
