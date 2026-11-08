// Import order matters: ES imports are hoisted and run in order, and bundle.js needs window.React.
import "./react-global.ts";
import "../../design/system/components/bundle.js";
import type * as DS from "../../design/system/components/index.d.ts";

export type * from "../../design/system/components/index.d.ts";

declare global {
  interface Window {
    Orasenda: typeof DS;
  }
}

export const {
  Button,
  ModeChip,
  TimerRing,
  MenuBarTimer,
  TaskCard,
  TimeBlock,
  HabitDots,
  RoutineItem,
  WellnessNote,
  IntentPrompt,
  Dialog,
  FullScreenFocus,
  Input,
  TextArea,
  CapturePad,
  InlineNotice,
  Toast,
  NavRail,
  KanbanColumn,
  CommandPalette,
  EmptyState,
  StartButton,
  NowLine,
} = window.Orasenda;
