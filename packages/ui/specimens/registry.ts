import type { ReactElement } from "react";
import { CapturePadSpecimen } from "../src/components/ui/capture-pad.specimen.tsx";
import { ChoiceSpecimen } from "../src/components/ui/choice.specimen.tsx";
import { CommandPaletteSpecimen } from "../src/components/ui/command-palette.specimen.tsx";
import { DataTableSpecimen } from "../src/components/ui/data-table.specimen.tsx";
import { DialogSpecimen } from "../src/components/ui/dialog.specimen.tsx";
import { FloatingTimerSpecimen } from "../src/components/ui/floating-timer.specimen.tsx";
import { FullScreenFocusSpecimen } from "../src/components/ui/full-screen-focus.specimen.tsx";
import { IconSpecimen } from "../src/components/ui/icon.specimen.tsx";
import { IconButtonSpecimen } from "../src/components/ui/icon-button.specimen.tsx";
import { InboxRowSpecimen } from "../src/components/ui/inbox-row.specimen.tsx";
import { KbdSpecimen } from "../src/components/ui/kbd.specimen.tsx";
import { MenuBarTimerSpecimen } from "../src/components/ui/menu-bar-timer.specimen.tsx";
import { NavRailSpecimen } from "../src/components/ui/nav-rail.specimen.tsx";
import { PageFrameSpecimen } from "../src/components/ui/page-frame.specimen";
import { PopoverMenuSpecimen } from "../src/components/ui/popover-menu.specimen";
import { ShortcutListSpecimen } from "../src/components/ui/shortcut-list.specimen.tsx";
import { ShortcutRecorderSpecimen } from "../src/components/ui/shortcut-recorder.specimen.tsx";
import { StartButtonSpecimen } from "../src/components/ui/start-button.specimen";
import { TimerRingSpecimen } from "../src/components/ui/timer-ring.specimen.tsx";
import { TimerStripSpecimen } from "../src/components/ui/timer-strip.specimen.tsx";
import { TooltipSpecimen } from "../src/components/ui/tooltip.specimen";

export const specimens: Record<string, () => ReactElement> = {
  Icon: IconSpecimen,
  IconButton: IconButtonSpecimen,
  Tooltip: TooltipSpecimen,
  FloatingTimer: FloatingTimerSpecimen,
  FullScreenFocus: FullScreenFocusSpecimen,
  Kbd: KbdSpecimen,
  CommandPalette: CommandPaletteSpecimen,
  Dialog: DialogSpecimen,
  CapturePad: CapturePadSpecimen,
  NavRail: NavRailSpecimen,
  PageFrame: PageFrameSpecimen,
  MenuBarTimer: MenuBarTimerSpecimen,
  TimerRing: TimerRingSpecimen,
  TimerStrip: TimerStripSpecimen,
  StartButton: StartButtonSpecimen,
  PopoverMenu: PopoverMenuSpecimen,
  Choice: ChoiceSpecimen,
  ShortcutRecorder: ShortcutRecorderSpecimen,
  ShortcutList: ShortcutListSpecimen,
  InboxRow: InboxRowSpecimen,
  DataTable: DataTableSpecimen,
};
