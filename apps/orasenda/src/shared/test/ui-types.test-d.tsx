// Type-level test, checked by the app's `tsc --noEmit` (#35): `@orasenda/ui`'s Button accepts
// native button attributes as consumed from the app, and rejects a misspelled one.

import type {
  AppPickerProps,
  AppRole,
  AppRowProps,
  BarRowProps,
  CapturePadProps,
  Command,
  CommandPaletteProps,
  DialogNextProps,
  DialogProps,
  EmptyStateProps,
  FieldProps,
  FloatingTimerProps,
  FullScreenFocusProps,
  HabitDay,
  HabitDotsProps,
  HabitState,
  IconButtonProps,
  InlineNoticeProps,
  InputProps,
  IntentPromptNextProps,
  IntentPromptProps,
  IntentReason,
  InterruptionKind,
  KanbanColumnProps,
  KbdProps,
  MenuBarTimerProps,
  Mode,
  ModeChipProps,
  NavPage,
  NavRailProps,
  NowLineNextProps,
  NowLineProps,
  PageFrameProps,
  PopoverMenuItem,
  PopoverMenuProps,
  RoleTagProps,
  RoutineItemNextProps,
  RoutineItemProps,
  ScrollRegionProps,
  SelectProps,
  SessionSlotProps,
  SettingsIndexProps,
  SettingsIndexSection,
  SettingsRowProps,
  ShortcutRecorderProps,
  StartButtonProps,
  TaskCardMenu,
  TaskCardProps,
  TextAreaProps,
  TimeBlockProps,
  TimerLayout,
  TimerLayoutBox,
  TimerMode,
  TimerRingProps,
  TimerStripProps,
  ToastProps,
  TooltipProps,
  WellnessNoteProps,
} from "@orasenda/ui";
import { Button, type ButtonProps } from "@orasenda/ui";
import type {
  BarView,
  PriorityPick,
  PriorityView,
  ReviewView,
  Settings,
  ShutdownView_Serialize,
  StatsView_Serialize,
  WeeklyView_Serialize,
} from "../ipc/bindings";
import type { CoversEveryKey, SETTINGS_KEYS } from "../ipc/settingsQueue";
import {
  barView,
  priorityView,
  reviewView,
  shutdownView,
  statsView,
  weeklyView,
} from "./fixtures/review";

export const valid = (
  <Button onClick={() => {}} type="button" disabled aria-label="Start" variant="primary">
    Start
  </Button>
);

// @ts-expect-error `onClik` is not a button attribute.
export const typo = <Button onClik={() => {}}>Start</Button>;

export const onClick: ButtonProps["onClick"] = (event) => event.currentTarget.blur();

// #114: the settings key lists cover every generated field, and a list missing one fails to compile.
export const settingsKeysComplete: CoversEveryKey<Settings, typeof SETTINGS_KEYS> = true;

// @ts-expect-error a list without notifySessionEnd does not cover Settings.
export const settingsKeyMissing: CoversEveryKey<Settings, ["theme", "presetId"]> = true;

// @ts-expect-error a list without theme does not cover Settings.
export const settingsThemeMissing: CoversEveryKey<
  Settings,
  ["presetId", "extensionCap", "notifySessionEnd"]
> = true;

// The type-only exports of the previous surface stay exported: dropping one fails this file.
export type TypeSurface = [
  AppPickerProps,
  AppRole,
  AppRowProps,
  BarRowProps,
  CapturePadProps,
  Command,
  CommandPaletteProps,
  DialogNextProps,
  DialogProps,
  EmptyStateProps,
  FieldProps,
  FloatingTimerProps,
  FullScreenFocusProps,
  HabitDay,
  HabitDotsProps,
  HabitState,
  IconButtonProps,
  InlineNoticeProps,
  InputProps,
  IntentPromptNextProps,
  IntentPromptProps,
  IntentReason,
  InterruptionKind,
  KanbanColumnProps,
  KbdProps,
  MenuBarTimerProps,
  Mode,
  ModeChipProps,
  NavPage,
  NavRailProps,
  NowLineNextProps,
  NowLineProps,
  PageFrameProps,
  PopoverMenuItem,
  PopoverMenuProps,
  RoleTagProps,
  RoutineItemNextProps,
  RoutineItemProps,
  ScrollRegionProps,
  SelectProps,
  SessionSlotProps,
  SettingsIndexProps,
  SettingsIndexSection,
  SettingsRowProps,
  ShortcutRecorderProps,
  StartButtonProps,
  TaskCardMenu,
  TaskCardProps,
  TextAreaProps,
  TimeBlockProps,
  TimerLayout,
  TimerLayoutBox,
  TimerMode,
  TimerRingProps,
  TimerStripProps,
  ToastProps,
  TooltipProps,
  WellnessNoteProps,
];

// The review fixture builders return exactly the generated contract types, and a priority pick is
// a task or a new title, never both.
export const reviewBuilders: [
  BarView,
  PriorityView,
  ReviewView,
  ShutdownView_Serialize,
  StatsView_Serialize,
  WeeklyView_Serialize,
] = [barView(), priorityView(), reviewView(), shutdownView(), statsView(), weeklyView()];

export const pickTask: PriorityPick = { task: "task-1" };
export const pickNew: PriorityPick = { newTitle: "Plan the move" };
// @ts-expect-error a pick names a task or a title, not both
export const pickBoth: PriorityPick = { task: "task-1", newTitle: "Plan the move" };
// @ts-expect-error the primary flow is one of shutdown, weekly or none
export const badPrimary = reviewView({ primary: "monthly" });
