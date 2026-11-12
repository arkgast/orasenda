// Type-only exports: the *NextProps contracts and the contract-only components (README and static
// preview, no implementation yet). Each one is exported as a type; none has a runtime export.
import type * as React from "react";
import type { DialogProps } from "./components/ui/dialog";
import type { IntentPromptProps } from "./components/ui/intent-prompt";
import type { KanbanColumnProps } from "./components/ui/kanban-column";
import type { MenuBarTimerProps } from "./components/ui/menu-bar-timer";
import type { NowLineProps } from "./components/ui/now-line";
import type { RoutineItemProps } from "./components/ui/routine-item";
import type { TaskCardProps } from "./components/ui/task-card";

/** The timer modes a chip or ring can show. */
export type Mode = "focus" | "break" | "routine" | "warning" | "shallow" | "paused" | "idle";
export type TimerMode = Exclude<Mode, "shallow">;
/** The label, helper and error text of a form field. */
export interface FieldProps {
  label: string;
  helper?: string;
  error?: string;
}
/** One entry in a CommandPalette. */
export interface Command {
  id: string;
  label: string;
  hint?: string;
  /** One canonical glyph string ("⌃⌥F"), drawn as a right-aligned Kbd whose spoken form is part of the row's name. */
  shortcut?: string;
}

declare global {
  interface Window {
    /** Set by the host, before or after bundle.js runs. strictShortcuts true: describeShortcut throws on an unknown glyph string (tests, specimens). */
    Orasenda: {
      ModeChip: typeof import("./components/ui/mode-chip").ModeChip;
      TimerRing: typeof import("./components/ui/timer-ring").TimerRing;
      TimerStrip: typeof import("./components/ui/timer-strip").TimerStrip;
      timerLayout: typeof import("./lib/timer-layout").timerLayout;
      TaskCard: typeof import("./components/ui/task-card").TaskCard;
      HabitDots: typeof import("./components/ui/habit-dots").HabitDots;
      IntentPrompt: typeof import("./components/ui/intent-prompt").IntentPrompt;
      Dialog: typeof import("./components/ui/dialog").Dialog;
      FullScreenFocus: typeof import("./components/ui/full-screen-focus").FullScreenFocus;
      TextArea: typeof import("./components/ui/text-area").TextArea;
      CapturePad: typeof import("./components/ui/capture-pad").CapturePad;
      InlineNotice: typeof import("./components/ui/inline-notice").InlineNotice;
      Toast: typeof import("./components/ui/toast").Toast;
      NavRail: (props: {
        current: "today" | "board" | "calendar" | "routines" | "review" | "settings";
        onNavigate: (
          page: "today" | "board" | "calendar" | "routines" | "review" | "settings",
        ) => void;
      }) => React.ReactElement;
      KanbanColumn: typeof import("./components/ui/kanban-column").KanbanColumn;
      CommandPalette: typeof import("./components/ui/command-palette").CommandPalette;
      StartButton: typeof import("./components/ui/start-button").StartButton;
      NowLine: (props: { time: string }) => React.ReactElement;
      ScrollRegion: (props: { label: string; children?: React.ReactNode }) => React.ReactElement;
      SettingsRow: typeof import("./components/ui/settings-row").SettingsRow;
      IconButton: typeof import("./components/ui/icon-button").IconButton;
      Tooltip: typeof import("./components/ui/tooltip").Tooltip;
      Kbd: (
        props: { keys: string } & (
          | { inTooltip: true; spoken?: string }
          | { inTooltip?: false; spoken: string }
        ),
      ) => React.ReactElement;
      describeShortcut: (glyphs: string) => { aria: string; spoken: string };
      PopoverMenu: typeof import("./components/ui/popover-menu").PopoverMenu;
      ShortcutRecorder: typeof import("./components/ui/shortcut-recorder").ShortcutRecorder;
      /** Set by the host, before or after bundle.js runs. true: describeShortcut throws on an unknown glyph string (tests, specimens). Otherwise it passes the glyphs through and warns once per call. */
      strictShortcuts?: boolean;
    };
  }
}

/* Redesign pass, 2026-11-09: contracts documented with static previews. A contract below with no `declare function` (and each one marked "Not implemented in bundle.js yet") is not in bundle.js yet. The *NextProps are separate interfaces, not on the runtime-exported components above, so code using the bundle cannot pass them by mistake. Each *NextProps is the redesign contract for an existing component; it moves onto that component's Props when bundle.js implements it. */
/** Not implemented in bundle.js yet. */
export interface TaskCardNextProps extends TaskCardProps {
  /** Click or arrow key selects; Return, double-click or Open opens. */
  onSelect?: () => void;
  /** 'row' is the 44px TaskRow. */
  density?: "card" | "row";
}
/** Not implemented in bundle.js yet. */
export interface RoutineItemNextProps extends RoutineItemProps {
  /** Overview list form: no checkbox, no tab stop. */ readOnly?: boolean;
}
/** Not implemented in bundle.js yet. */
export interface IntentPromptNextProps extends IntentPromptProps {
  variant?: "gentle" | "waiting" | "firm" | "strongLock" | "fallback";
  /** e.g. "Focus · ends 15:20" */
  context?: string;
  /** e.g. "Gentle pause. Esc or Return goes back to focus." */
  strengthLine?: string;
}
/** Not implemented in bundle.js yet. 'safe': cancel is the primary and the initial focus; used only for ending a Strong lock. */
export interface DialogNextProps extends DialogProps {
  emphasis?: "default" | "safe";
}
/** Not implemented in bundle.js yet. Folds into a column-strip-width strip. */
export interface KanbanColumnNextProps extends KanbanColumnProps {
  collapsed?: boolean;
  onToggle?: () => void;
}
/** Not implemented in bundle.js yet. Week lanes: the rule without the label. */
export interface NowLineNextProps extends NowLineProps {
  compact?: boolean;
}
export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  /** Only for a compact page picker that replaces a visible title. */
  labelHidden?: boolean;
  options: Array<{ value: string; label: string }>;
}
export interface SessionSlotProps extends Omit<MenuBarTimerProps, "compact"> {
  onPause: () => void;
  onResume: () => void;
}
export type AppRole = "distracting" | "allowed" | "focus" | "neutral" | "neverRecord" | "site";
export interface RoleTagProps {
  role: AppRole;
  children?: React.ReactNode;
}
interface AppRowBase {
  name: string;
  icon?: React.ReactNode;
  note?: string;
  role: AppRole;
  compact?: boolean;
  error?: string;
}
/** Exactly one interactive element per row: Change role, or Record again for a never-record row. Built-in rows have none. */
export type AppRowProps = AppRowBase &
  (
    | { builtIn: true; onChangeRole?: never; onRecordAgain?: never }
    | { builtIn?: false; onChangeRole: () => void; onRecordAgain?: never }
    | { builtIn?: false; role: "neverRecord"; onRecordAgain: () => void; onChangeRole?: never }
  );
export interface AppPickerProps {
  open?: boolean;
  variant?: "roles" | "neverRecord";
  apps: Array<{ id: string; name: string; section: "open" | "recent" | "all"; listedAs?: string }>;
  onAdd: (ids: string[], role?: AppRole) => void;
  onClose: () => void;
}
export interface BarRowProps {
  label: React.ReactNode;
  minutes: number;
  max: number;
  duration: string;
  spoken: string;
  goal?: { minutes: number; words: string };
}
export type NavPage = "today" | "board" | "calendar" | "routines" | "review" | "settings";
