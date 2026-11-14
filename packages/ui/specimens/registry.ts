import type { ReactElement } from "react";
import { CapturePadSpecimen } from "../src/components/ui/capture-pad.specimen.tsx";
import { ChecklistSpecimen } from "../src/components/ui/checklist.specimen.tsx";
import { ChoiceSpecimen } from "../src/components/ui/choice.specimen.tsx";
import { CommandPaletteSpecimen } from "../src/components/ui/command-palette.specimen.tsx";
import { DataTableSpecimen } from "../src/components/ui/data-table.specimen.tsx";
import { DayPickerSpecimen } from "../src/components/ui/day-picker.specimen.tsx";
import { DialogSpecimen } from "../src/components/ui/dialog.specimen.tsx";
import { FloatingTimerSpecimen } from "../src/components/ui/floating-timer.specimen.tsx";
import { FullScreenFocusSpecimen } from "../src/components/ui/full-screen-focus.specimen.tsx";
import { HabitDotsSpecimen } from "../src/components/ui/habit-dots.specimen.tsx";
import { IconSpecimen } from "../src/components/ui/icon.specimen.tsx";
import { IconButtonSpecimen } from "../src/components/ui/icon-button.specimen.tsx";
import { InboxRowSpecimen } from "../src/components/ui/inbox-row.specimen.tsx";
import { KanbanColumnSpecimen } from "../src/components/ui/kanban-column.specimen.tsx";
import { KbdSpecimen } from "../src/components/ui/kbd.specimen.tsx";
import { MenuBarTimerSpecimen } from "../src/components/ui/menu-bar-timer.specimen.tsx";
import { NavRailSpecimen } from "../src/components/ui/nav-rail.specimen.tsx";
import { PageFrameSpecimen } from "../src/components/ui/page-frame.specimen";
import { PopoverMenuSpecimen } from "../src/components/ui/popover-menu.specimen";
import { RoutineCardSpecimen } from "../src/components/ui/routine-card.specimen.tsx";
import { RoutineStepSpecimen } from "../src/components/ui/routine-step.specimen.tsx";
import { SelectSpecimen } from "../src/components/ui/select.specimen.tsx";
import { SettingsNavSpecimen } from "../src/components/ui/settings-nav.specimen.tsx";
import { ShortcutListSpecimen } from "../src/components/ui/shortcut-list.specimen.tsx";
import { ShortcutRecorderSpecimen } from "../src/components/ui/shortcut-recorder.specimen.tsx";
import { StartButtonSpecimen } from "../src/components/ui/start-button.specimen";
import { StepperSpecimen } from "../src/components/ui/stepper.specimen.tsx";
import { TagFieldSpecimen } from "../src/components/ui/tag-field.specimen.tsx";
import { TaskCardSpecimen } from "../src/components/ui/task-card.specimen.tsx";
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
  SettingsNav: SettingsNavSpecimen,
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
  RoutineCard: RoutineCardSpecimen,
  HabitDots: HabitDotsSpecimen,
  RoutineStep: RoutineStepSpecimen,
  DayPicker: DayPickerSpecimen,
  KanbanColumn: KanbanColumnSpecimen,
  TaskCard: TaskCardSpecimen,
  Select: SelectSpecimen,
  Checklist: ChecklistSpecimen,
  TagField: TagFieldSpecimen,
  Stepper: StepperSpecimen,
};
