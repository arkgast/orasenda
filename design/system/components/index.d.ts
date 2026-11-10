import type * as React from 'react';
export type Mode = 'focus' | 'break' | 'routine' | 'warning' | 'shallow' | 'paused' | 'idle';
export type TimerMode = Exclude<Mode, 'shallow'>;
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> { variant?: 'primary' | 'break' | 'quiet' | 'ghost' | 'critical'; size?: 'md' | 'lg'; loading?: boolean }
export declare function Button(props: ButtonProps): React.ReactElement;
export interface ModeChipProps { mode?: Mode; children?: React.ReactNode }
export declare function ModeChip(props: ModeChipProps): React.ReactElement;
/** progress is the elapsed fraction [0,1]; the arc shows what is left. */
export interface TimerRingProps { remaining?: string; remainingLabel?: string; progress?: number; mode?: TimerMode; task?: string; size?: number; stroke?: number; clock?: string }
export declare function TimerRing(props: TimerRingProps): React.ReactElement;
/** compact defaults to true. Use false only for the floating mini timer. */
export interface MenuBarTimerProps { remaining?: string; remainingLabel?: string; progress?: number; mode?: TimerMode; task?: string; compact?: boolean }
export declare function MenuBarTimer(props: MenuBarTimerProps): React.ReactElement;
export interface TaskCardProps { title: string; type?: 'deep' | 'shallow'; estimate?: number; done?: number; tracked?: string; project?: string; frog?: boolean; active?: boolean; selected?: boolean; disabled?: boolean; onOpen?: () => void }
export declare function TaskCard(props: TaskCardProps): React.ReactElement;
export interface TimeBlockProps { type?: 'deep' | 'shallow' | 'break' | 'routine' | 'personal' | 'overflow'; title?: string; start?: string; end?: string; now?: boolean; height?: number | string; compact?: boolean; selected?: boolean; disabled?: boolean; onSelect?: () => void }
export declare function TimeBlock(props: TimeBlockProps): React.ReactElement;
export type HabitState = 'done' | 'skipped' | 'rest' | 'future';
export interface HabitDay { state: HabitState; today?: boolean; /** A localised date, e.g. Monday 9 November. */ label?: string }
export interface HabitDotsProps { name?: string; days: Array<HabitDay | HabitState>; note?: string; legend?: boolean; restartNote?: string }
export declare function HabitDots(props: HabitDotsProps): React.ReactElement;
/** With onChange, done is controlled. Without it, defaultDone (or initial done) is local preview state. */
export interface RoutineItemProps { label: string; detail?: string; done?: boolean; defaultDone?: boolean; optional?: boolean; disabled?: boolean; onChange?: (done: boolean) => void }
export declare function RoutineItem(props: RoutineItemProps): React.ReactElement;
export interface WellnessNoteProps { children?: React.ReactNode; as?: 'span' | 'p' }
export declare function WellnessNote(props: WellnessNoteProps): React.ReactElement;
/** The reasons offered on step 2, in order. */
export type IntentReason = 'Work' | 'Quick check' | 'Other';
/** Two steps. Wait renders on step 1 only when onWait is passed; "I need <app> now" and step 2 only when onContinue is passed. onContinue always receives the picked reason. */
export interface IntentPromptProps { open?: boolean; app?: string; title?: string; message?: string; waitLabel?: string; onReturn?: () => void; onWait?: () => void; onContinue?: (reason: IntentReason) => void }
export declare function IntentPrompt(props: IntentPromptProps): React.ReactElement;
/** Escape and the cancel button call onCancel. destructive styles confirm as critical and adds the scrim. */
export interface DialogProps { open?: boolean; title: string; description?: string; children?: React.ReactNode; confirmLabel: string; cancelLabel?: string; onCancel: () => void; onConfirm: () => void; destructive?: boolean; scrim?: boolean; loading?: boolean }
export declare function Dialog(props: DialogProps): React.ReactElement;
export interface FullScreenFocusProps extends Omit<TimerRingProps, 'size' | 'stroke'> { onExit: () => void }
export declare function FullScreenFocus(props: FullScreenFocusProps): React.ReactElement;
export interface FieldProps { label: string; helper?: string; error?: string }
/** unit adds a suffix ("min") after a number field sized to number-width. */
export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement>, FieldProps { unit?: string }
export declare function Input(props: InputProps): React.ReactElement;
export interface TextAreaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement>, FieldProps {}
export declare function TextArea(props: TextAreaProps): React.ReactElement;
export type InterruptionKind = 'internal' | 'external';
export interface CapturePadProps { open?: boolean; value: string; kind: InterruptionKind; onChange: (value: string) => void; onKindChange: (kind: InterruptionKind) => void; onSave: (note: { text: string; kind: InterruptionKind }) => void | Promise<void>; onClose: () => void }
export declare function CapturePad(props: CapturePadProps): React.ReactElement;
/** variant 'row' is the reserved 44px status row; tone 'attention' (alert glyph) and 'rest' (ink-muted, no glyph) are for that row only. actionName is the accessible name when it differs from the visible actionLabel (e.g. "Try again saving break minutes"). */
export type InlineNoticeProps = { children: React.ReactNode; actionLabel?: string; actionName?: string; onAction?: () => void } & ({ variant?: 'default'; tone?: 'neutral' | 'warning' } | { variant: 'row'; tone?: 'neutral' | 'attention' | 'rest' | 'warning'; /** Defaults to 'ghost'. */ actionVariant?: 'quiet' | 'ghost' })
export declare function InlineNotice(props: InlineNoticeProps): React.ReactElement;
export interface ToastProps extends Omit<InlineNoticeProps, 'variant' | 'tone'> { tone?: 'neutral' | 'warning'; onDismiss?: () => void }
export declare function Toast(props: ToastProps): React.ReactElement;
export type NavPage = 'today' | 'board' | 'calendar' | 'routines' | 'review' | 'settings';
export interface NavRailProps { current: NavPage; onNavigate: (page: NavPage) => void }
export declare function NavRail(props: NavRailProps): React.ReactElement;
export interface KanbanColumnProps { title: string; count: number; limit?: number; children?: React.ReactNode; emptyMessage?: string }
export declare function KanbanColumn(props: KanbanColumnProps): React.ReactElement;
export interface Command { id: string; label: string; hint?: string }
export interface CommandPaletteProps { open?: boolean; commands: Command[]; onSelect: (id: string) => void; onClose: () => void }
export declare function CommandPalette(props: CommandPaletteProps): React.ReactElement;
/** 'inline' sits inside a SettingsRow: one line, no action. */
export type EmptyStateProps = { title?: string; message?: string; actionLabel?: string; onAction?: () => void; variant?: 'default' } | { title?: never; message?: string; variant: 'inline'; actionLabel?: never; onAction?: never }
export declare function EmptyState(props: EmptyStateProps): React.ReactElement;
export interface StartButtonProps { onStart: () => void; onQuickStart: () => void; finishTime?: string; disabled?: boolean; loading?: boolean }
export declare function StartButton(props: StartButtonProps): React.ReactElement;
export interface NowLineProps { time: string }
export declare function NowLine(props: NowLineProps): React.ReactElement;
/* Redesign pass, 2026-11-09: contracts documented with static previews. A contract below with no `declare function` (and each one marked "Not implemented in bundle.js yet") is not in bundle.js yet. The *NextProps are separate interfaces, not on the runtime-exported components above, so code using the bundle cannot pass them by mistake. Each *NextProps is the redesign contract for an existing component; it moves onto that component's Props when bundle.js implements it. */
/** Not implemented in bundle.js yet. 'fluid' sizes to the container between timer-min-size and timer-full-size. */
export interface TimerRingNextProps extends Omit<TimerRingProps, 'size'> { size?: number | 'fluid' }
/** Not implemented in bundle.js yet. */
export interface TaskCardNextProps extends TaskCardProps { /** Click or arrow key selects; Return, double-click or Open opens. */ onSelect?: () => void; /** 'row' is the 44px TaskRow. */ density?: 'card' | 'row' }
/** Not implemented in bundle.js yet. */
export interface RoutineItemNextProps extends RoutineItemProps { /** Overview list form: no checkbox, no tab stop. */ readOnly?: boolean }
/** Not implemented in bundle.js yet. */
export interface IntentPromptNextProps extends IntentPromptProps { variant?: 'gentle' | 'waiting' | 'firm' | 'strongLock' | 'fallback'; /** e.g. "Focus · ends 15:20" */ context?: string; /** e.g. "Gentle pause. Esc or Return goes back to focus." */ strengthLine?: string }
/** Not implemented in bundle.js yet. 'safe': cancel is the primary and the initial focus; used only for ending a Strong lock. */
export interface DialogNextProps extends DialogProps { emphasis?: 'default' | 'safe' }
/** Not implemented in bundle.js yet. */
export interface FullScreenFocusNextProps extends FullScreenFocusProps { onPause?: () => void; onResume?: () => void; onEnd?: () => void; onStart?: () => void }
/** Not implemented in bundle.js yet. Folds into a column-strip-width strip. */
export interface KanbanColumnNextProps extends KanbanColumnProps { collapsed?: boolean; onToggle?: () => void }
/** Not implemented in bundle.js yet. shortcut is a right-aligned Kbd glyph string. */
export interface CommandNext extends Command { shortcut?: string }
/** Not implemented in bundle.js yet. compact applies below layout-compact-height. */
export interface CommandPaletteNextProps extends Omit<CommandPaletteProps, 'commands'> { commands: CommandNext[]; compact?: boolean }
/** Not implemented in bundle.js yet. finishTime moves to the preset summary; unavailable replaces disabled (pair it with a status-row line); compactLabel is the visible label below 400px of content, the name stays "Start focus". */
export interface StartButtonNextProps extends Omit<StartButtonProps, 'disabled'> { unavailable?: boolean; compactLabel?: string }
/** Not implemented in bundle.js yet. Week lanes: the rule without the label. */
export interface NowLineNextProps extends NowLineProps { compact?: boolean }
/** The ARIA and spoken forms of one canonical glyph string (Kbd README, "Shortcut glyphs"): modifiers in the order ⌃⌥⇧⌘, then one key from A-Z, 0-9, '.', ',', '↩', 'Space', 'Esc', '⌫', '←', '↑', '→', '↓', 'Tab'. '⌃⌥F' gives { aria: 'Control+Alt+F', spoken: 'Control-Option-F' }; '⌘.' gives { aria: 'Meta+Period', spoken: 'Command-Period' }. An unknown string throws when window.Orasenda.strictShortcuts is true; otherwise it returns { aria: glyphs, spoken: glyphs } and logs one console.warn. */
export declare function describeShortcut(glyphs: string): { aria: string; spoken: string };
/** label is the accessible name and the built-in Tooltip's text; the icon is aria-hidden. shortcut is one canonical glyph string, shown as a Kbd in the tooltip and set as aria-keyshortcuts (describeShortcut(shortcut).aria); pass it only while that shortcut is live. id, aria-haspopup, aria-expanded and aria-controls land on the button; the host sets aria-expanded and aria-controls from its menu's open state and id. */
export interface IconButtonProps { label: string; icon: React.ReactNode; shortcut?: string; size?: 'md' | 'round'; onClick?: () => void; disabled?: boolean; 'aria-haspopup'?: 'menu'; id?: string; 'aria-expanded'?: boolean; 'aria-controls'?: string }
export declare function IconButton(props: IconButtonProps): React.ReactElement;
/** Wraps one focusable trigger whose accessible name holds label (an IconButton's is exactly label); the host sets that trigger's aria-keyshortcuts from describeShortcut(shortcut).aria (IconButton does this itself). The panel is aria-hidden, placed by script in the nearest open dialog or the page body. */
export interface TooltipProps { label: string; shortcut?: string; placement?: 'auto'; children: React.ReactElement }
export declare function Tooltip(props: TooltipProps): React.ReactElement;
/** In running text, spoken is required because the glyph is aria-hidden; inside a Tooltip the tooltip label speaks. */
export type KbdProps = { keys: string } & ({ inTooltip: true; spoken?: string } | { inTooltip?: false; spoken: string })
export declare function Kbd(props: KbdProps): React.ReactElement;
export interface TimerStripProps { remaining?: string; remainingLabel?: string; progress?: number; mode?: TimerMode; idleLength?: string }
export interface FloatingTimerProps extends Omit<MenuBarTimerProps, 'compact'> { onPause?: () => void; onResume?: () => void; onStart?: () => void; onOpen?: () => void }
export interface PopoverMenuItem { id: string; label: string; meta?: string; kind: 'radio' | 'checkbox' | 'link'; checked?: boolean; disabled?: boolean }
export interface PopoverMenuProps { heading: string; description?: string; items: PopoverMenuItem[]; readOnly?: boolean; onSelect: (id: string) => void; onClose: () => void }
export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> { label: string; /** Only for a compact page picker that replaces a visible title. */ labelHidden?: boolean; options: Array<{ value: string; label: string }> }
export interface ScrollRegionProps { label: string; children?: React.ReactNode }
export interface PageFrameProps { title: string; primary?: React.ReactNode; status?: React.ReactNode; variant?: 'list' | 'flow'; step?: string; footer?: React.ReactNode; compactPicker?: React.ReactNode; children?: React.ReactNode }
export declare function PageFrame(props: PageFrameProps): React.ReactElement;
export declare function ScrollRegion(props: ScrollRegionProps): React.ReactElement;
export interface SessionSlotProps extends Omit<MenuBarTimerProps, 'compact'> { onPause: () => void; onResume: () => void }
/** A problem always carries words; alert adds the glyph to those words, never on its own. */
export interface SettingsIndexSection { id: string; name: string; value: string; problem?: { text: string; alert?: boolean } }
export interface SettingsIndexProps { sections: SettingsIndexSection[]; current: string; onJump: (id: string) => void }
/** actionName is the accessible name when it differs from actionLabel; actionVariant defaults to 'quiet'. The row is role="group", labelled by label and described by helper, status and disabledReason. */
export interface SettingsRowProps { /** Fixes the base of the generated ids (<id>-label, <id>-help, <id>-status, <id>-why); otherwise useId(). */ id?: string; label: string; helper: string; status?: React.ReactNode; actionLabel?: string; actionName?: string; actionVariant?: 'quiet' | 'ghost'; onAction?: () => void; disabledReason?: string; children: React.ReactNode }
export declare function SettingsIndex(props: SettingsIndexProps): React.ReactElement;
export declare function SettingsRow(props: SettingsRowProps): React.ReactElement;
export interface ShortcutRecorderProps { label: string; keys?: string; spokenKeys?: string; recording?: boolean; conflict?: string; onRecord: (keys: string | null) => void; onRestoreDefault?: () => void }
export type AppRole = 'distracting' | 'allowed' | 'focus' | 'neutral' | 'neverRecord' | 'site';
export interface RoleTagProps { role: AppRole; children?: React.ReactNode }
interface AppRowBase { name: string; icon?: React.ReactNode; note?: string; role: AppRole; compact?: boolean; error?: string }
/** Exactly one interactive element per row: Change role, or Record again for a never-record row. Built-in rows have none. */
export type AppRowProps = AppRowBase & ({ builtIn: true; onChangeRole?: never; onRecordAgain?: never } | { builtIn?: false; onChangeRole: () => void; onRecordAgain?: never } | { builtIn?: false; role: 'neverRecord'; onRecordAgain: () => void; onChangeRole?: never })
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
      PageFrame: typeof PageFrame; ScrollRegion: typeof ScrollRegion; SettingsIndex: typeof SettingsIndex; SettingsRow: typeof SettingsRow;
      IconButton: typeof IconButton; Tooltip: typeof Tooltip; Kbd: typeof Kbd; describeShortcut: typeof describeShortcut;
      /** Set by the host, before or after bundle.js runs. true: describeShortcut throws on an unknown glyph string (tests, specimens). Otherwise it passes the glyphs through and warns once per call. */
      strictShortcuts?: boolean;
    };
  }
}
