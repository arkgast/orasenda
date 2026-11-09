import type * as React from 'react';
export type Mode = 'focus' | 'break' | 'routine' | 'warning' | 'shallow' | 'paused' | 'idle';
export type TimerMode = Exclude<Mode, 'shallow'>;
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> { variant?: 'primary' | 'break' | 'quiet' | 'ghost' | 'critical'; size?: 'md' | 'lg'; loading?: boolean }
export declare function Button(props: ButtonProps): React.ReactElement;
export interface ModeChipProps { mode?: Mode; children?: React.ReactNode }
export declare function ModeChip(props: ModeChipProps): React.ReactElement;
/** progress is the elapsed fraction [0,1]; the arc shows what is left. */
export interface TimerRingProps { remaining?: string; remainingLabel?: string; progress?: number; mode?: TimerMode; task?: string; /** 'fluid' sizes to the container between timer-min-size and timer-full-size. */ size?: number | 'fluid'; stroke?: number; clock?: string }
export declare function TimerRing(props: TimerRingProps): React.ReactElement;
/** compact defaults to true. Use false only for the floating mini timer. */
export interface MenuBarTimerProps { remaining?: string; remainingLabel?: string; progress?: number; mode?: TimerMode; task?: string; compact?: boolean }
export declare function MenuBarTimer(props: MenuBarTimerProps): React.ReactElement;
export interface TaskCardProps { title: string; type?: 'deep' | 'shallow'; estimate?: number; done?: number; tracked?: string; project?: string; frog?: boolean; active?: boolean; selected?: boolean; disabled?: boolean; onOpen?: () => void; /** Click or arrow key selects; Return, double-click or Open opens. */ onSelect?: () => void; /** 'row' is the 44px TaskRow. */ density?: 'card' | 'row' }
export declare function TaskCard(props: TaskCardProps): React.ReactElement;
export interface TimeBlockProps { type?: 'deep' | 'shallow' | 'break' | 'routine' | 'personal' | 'overflow'; title?: string; start?: string; end?: string; now?: boolean; height?: number | string; compact?: boolean; selected?: boolean; disabled?: boolean; onSelect?: () => void }
export declare function TimeBlock(props: TimeBlockProps): React.ReactElement;
export type HabitState = 'done' | 'skipped' | 'rest' | 'future';
export interface HabitDay { state: HabitState; today?: boolean; /** A localised date, e.g. Monday 9 November. */ label?: string }
export interface HabitDotsProps { name?: string; days: Array<HabitDay | HabitState>; note?: string; legend?: boolean; restartNote?: string }
export declare function HabitDots(props: HabitDotsProps): React.ReactElement;
/** With onChange, done is controlled. Without it, defaultDone (or initial done) is local preview state. */
export interface RoutineItemProps { label: string; detail?: string; done?: boolean; defaultDone?: boolean; optional?: boolean; disabled?: boolean; /** Overview list form: no checkbox, no tab stop. */ readOnly?: boolean; onChange?: (done: boolean) => void }
export declare function RoutineItem(props: RoutineItemProps): React.ReactElement;
export interface WellnessNoteProps { children?: React.ReactNode; as?: 'span' | 'p' }
export declare function WellnessNote(props: WellnessNoteProps): React.ReactElement;
/** The reasons offered on step 2, in order. */
export type IntentReason = 'Work' | 'Quick check' | 'Other';
/** Two steps. Wait renders on step 1 only when onWait is passed; "I need <app> now" and step 2 only when onContinue is passed. onContinue always receives the picked reason. */
export interface IntentPromptProps { open?: boolean; app?: string; title?: string; message?: string; waitLabel?: string; onReturn?: () => void; onWait?: () => void; onContinue?: (reason: IntentReason) => void; variant?: 'gentle' | 'waiting' | 'firm' | 'strongLock' | 'fallback'; /** e.g. "Focus · ends 15:20" */ context?: string; /** e.g. "Gentle pause. Esc or Return goes back to focus." */ strengthLine?: string }
export declare function IntentPrompt(props: IntentPromptProps): React.ReactElement;
/** Escape and the cancel button call onCancel. destructive styles confirm as critical and adds the scrim. */
export interface DialogProps { open?: boolean; title: string; description?: string; children?: React.ReactNode; confirmLabel: string; cancelLabel?: string; onCancel: () => void; onConfirm: () => void; destructive?: boolean; scrim?: boolean; loading?: boolean; /** 'safe': cancel is the primary and the initial focus; used only for ending a Strong lock. */ emphasis?: 'default' | 'safe' }
export declare function Dialog(props: DialogProps): React.ReactElement;
export interface FullScreenFocusProps extends Omit<TimerRingProps, 'size' | 'stroke'> { onExit: () => void; onPause?: () => void; onResume?: () => void; onEnd?: () => void; onStart?: () => void }
export declare function FullScreenFocus(props: FullScreenFocusProps): React.ReactElement;
export interface FieldProps { label: string; helper?: string; error?: string }
export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement>, FieldProps { /** Suffix after a number field sized to number-width, e.g. "min". */ unit?: string }
export declare function Input(props: InputProps): React.ReactElement;
export interface TextAreaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement>, FieldProps {}
export declare function TextArea(props: TextAreaProps): React.ReactElement;
export type InterruptionKind = 'internal' | 'external';
export interface CapturePadProps { open?: boolean; value: string; kind: InterruptionKind; onChange: (value: string) => void; onKindChange: (kind: InterruptionKind) => void; onSave: (note: { text: string; kind: InterruptionKind }) => void | Promise<void>; onClose: () => void }
export declare function CapturePad(props: CapturePadProps): React.ReactElement;
export interface InlineNoticeProps { children: React.ReactNode; /** attention (alert glyph) is for the status row. */ tone?: 'neutral' | 'attention' | 'warning'; actionLabel?: string; onAction?: () => void; /** 'row' is the reserved 44px status row. */ variant?: 'default' | 'row' }
export declare function InlineNotice(props: InlineNoticeProps): React.ReactElement;
export interface ToastProps extends InlineNoticeProps { onDismiss?: () => void }
export declare function Toast(props: ToastProps): React.ReactElement;
export type NavPage = 'today' | 'board' | 'calendar' | 'routines' | 'review' | 'settings';
export interface NavRailProps { current: NavPage; onNavigate: (page: NavPage) => void }
export declare function NavRail(props: NavRailProps): React.ReactElement;
export interface KanbanColumnProps { title: string; count: number; limit?: number; children?: React.ReactNode; emptyMessage?: string; /** Folds into a column-strip-width strip. */ collapsed?: boolean; onToggle?: () => void }
export declare function KanbanColumn(props: KanbanColumnProps): React.ReactElement;
export interface Command { id: string; label: string; hint?: string; /** A right-aligned Kbd glyph string. */ shortcut?: string }
export interface CommandPaletteProps { open?: boolean; commands: Command[]; onSelect: (id: string) => void; onClose: () => void; /** Below layout-compact-height. */ compact?: boolean }
export declare function CommandPalette(props: CommandPaletteProps): React.ReactElement;
export interface EmptyStateProps { title?: string; message?: string; actionLabel?: string; onAction?: () => void; /** 'inline' sits inside a SettingsRow: one line, no action. */ variant?: 'default' | 'inline' }
export declare function EmptyState(props: EmptyStateProps): React.ReactElement;
export interface StartButtonProps { onStart: () => void; onQuickStart: () => void; /** Moves to the preset summary in the redesign. */ finishTime?: string; loading?: boolean; /** The timer cannot start; pair with a status-row line. */ unavailable?: boolean; /** Visible label below 400px of content; the name stays "Start focus". */ compactLabel?: string }
export declare function StartButton(props: StartButtonProps): React.ReactElement;
export interface NowLineProps { time: string; /** Week lanes: the rule without the label. */ compact?: boolean }
export declare function NowLine(props: NowLineProps): React.ReactElement;
/* Redesign pass, 2026-11-09: contracts for components documented with static previews; they are not in the preview bundle yet. */
export interface IconButtonProps { label: string; icon: React.ReactNode; shortcut?: string; size?: 'md' | 'round'; onClick?: () => void; disabled?: boolean; 'aria-haspopup'?: 'menu' }
export interface TooltipProps { label: string; shortcut?: string; placement?: 'auto' }
export interface KbdProps { keys: string; spoken?: string }
export interface TimerStripProps { remaining?: string; remainingLabel?: string; progress?: number; mode?: TimerMode; idleLength?: string }
export interface FloatingTimerProps extends Omit<MenuBarTimerProps, 'compact'> { onPause?: () => void; onResume?: () => void; onStart?: () => void; onOpen?: () => void }
export interface PopoverMenuItem { id: string; label: string; meta?: string; kind: 'radio' | 'checkbox' | 'link'; checked?: boolean; disabled?: boolean }
export interface PopoverMenuProps { heading: string; description?: string; items: PopoverMenuItem[]; readOnly?: boolean; onSelect: (id: string) => void; onClose: () => void }
export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> { label: string; /** Only for a compact page picker that replaces a visible title. */ labelHidden?: boolean; options: Array<{ value: string; label: string }> }
export interface ScrollRegionProps { label: string; children?: React.ReactNode }
export interface PageFrameProps { title: string; primary?: React.ReactNode; status?: React.ReactNode; variant?: 'list' | 'flow'; step?: string; footer?: React.ReactNode; compactPicker?: React.ReactNode; children?: React.ReactNode }
export interface SessionSlotProps extends Omit<MenuBarTimerProps, 'compact'> { onPause: () => void; onResume: () => void }
export interface SettingsIndexSection { id: string; name: string; value: string; problem?: string; alert?: boolean }
export interface SettingsIndexProps { sections: SettingsIndexSection[]; current: string; onJump: (id: string) => void }
export interface SettingsRowProps { label: string; helper: string; status?: React.ReactNode; actionLabel?: string; onAction?: () => void; disabledReason?: string; children: React.ReactNode }
export interface ShortcutRecorderProps { label: string; keys?: string; spokenKeys?: string; recording?: boolean; conflict?: string; onRecord: (keys: string | null) => void; onRestoreDefault?: () => void }
export type AppRole = 'distracting' | 'allowed' | 'focus' | 'neutral' | 'neverRecord' | 'site';
export interface RoleTagProps { role: AppRole; children?: React.ReactNode }
export interface AppRowProps { name: string; icon?: React.ReactNode; note?: string; role: AppRole; builtIn?: boolean; compact?: boolean; onChangeRole?: () => void; onRecordAgain?: () => void; error?: string }
export interface AppPickerProps { open?: boolean; variant?: 'roles' | 'neverRecord'; apps: Array<{ id: string; name: string; section: 'open' | 'recent' | 'all'; listedAs?: string }>; onAdd: (ids: string[], role?: AppRole) => void; onClose: () => void }
export interface BarRowProps { label: React.ReactNode; minutes: number; max: number; duration: string; spoken: string; goal?: { minutes: number; words: string } }
declare global {
  interface Window {
    Orasenda: {
      Button: typeof Button; ModeChip: typeof ModeChip; TimerRing: typeof TimerRing; MenuBarTimer: typeof MenuBarTimer;
      TaskCard: typeof TaskCard; TimeBlock: typeof TimeBlock; HabitDots: typeof HabitDots; RoutineItem: typeof RoutineItem;
      WellnessNote: typeof WellnessNote; IntentPrompt: typeof IntentPrompt; Dialog: typeof Dialog; FullScreenFocus: typeof FullScreenFocus;
      Input: typeof Input; TextArea: typeof TextArea; CapturePad: typeof CapturePad; InlineNotice: typeof InlineNotice; Toast: typeof Toast;
      NavRail: typeof NavRail; KanbanColumn: typeof KanbanColumn; CommandPalette: typeof CommandPalette; EmptyState: typeof EmptyState;
      StartButton: typeof StartButton; NowLine: typeof NowLine;
    };
  }
}
