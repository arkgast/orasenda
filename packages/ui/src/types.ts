// Type-only exports: the *NextProps contracts and the contract-only components (README and static
// preview, no implementation yet). Each one is exported as a type; none has a runtime export.
import type * as React from "react";
import type { NowLineProps } from "./components/ui/now-line";
import type { RoutineItemProps } from "./components/ui/routine-item";
import type { MenuBarTimerProps } from "./components/ui/menu-bar-timer";
import type {
  Command,
  CommandPaletteProps,
  DialogProps,
  FullScreenFocusProps,
  IntentPromptProps,
  KanbanColumnProps,
  TaskCardProps,
} from "./legacy.d.ts";

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
/** Not implemented in bundle.js yet. */
export interface FullScreenFocusNextProps extends FullScreenFocusProps {
  onPause?: () => void;
  onResume?: () => void;
  onEnd?: () => void;
  onStart?: () => void;
}
/** Not implemented in bundle.js yet. Folds into a column-strip-width strip. */
export interface KanbanColumnNextProps extends KanbanColumnProps {
  collapsed?: boolean;
  onToggle?: () => void;
}
/** Not implemented in bundle.js yet. shortcut is a right-aligned Kbd glyph string. */
export interface CommandNext extends Command {
  shortcut?: string;
}
/** Not implemented in bundle.js yet. compact applies below layout-compact-height. */
export interface CommandPaletteNextProps extends Omit<CommandPaletteProps, "commands"> {
  commands: CommandNext[];
  compact?: boolean;
}
/** Not implemented in bundle.js yet. Week lanes: the rule without the label. */
export interface NowLineNextProps extends NowLineProps {
  compact?: boolean;
}
export interface FloatingTimerProps extends Omit<MenuBarTimerProps, "compact"> {
  onPause?: () => void;
  onResume?: () => void;
  onStart?: () => void;
  onOpen?: () => void;
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
export interface ShortcutRecorderProps {
  label: string;
  keys?: string;
  spokenKeys?: string;
  recording?: boolean;
  conflict?: string;
  onRecord: (keys: string | null) => void;
  onRestoreDefault?: () => void;
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
