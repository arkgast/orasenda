// Shared: React import and modes
import type * as React from 'react';
import type { InlineNoticeProps } from "./components/ui/inline-notice";
export type Mode = 'focus' | 'break' | 'routine' | 'warning' | 'shallow' | 'paused' | 'idle';
export type TimerMode = Exclude<Mode, 'shallow'>;
// end Shared: React import and modes
// TaskCard
export interface TaskCardProps { title: string; type?: 'deep' | 'shallow'; estimate?: number; done?: number; tracked?: string; project?: string; frog?: boolean; active?: boolean; selected?: boolean; disabled?: boolean; onOpen?: () => void }
export declare function TaskCard(props: TaskCardProps): React.ReactElement;
// end TaskCard
// IntentPrompt
/** The reasons offered on step 2, in order. */
export type IntentReason = 'Work' | 'Quick check' | 'Other';
/** Two steps. Wait renders on step 1 only when onWait is passed; "I need <app> now" and step 2 only when onContinue is passed. onContinue always receives the picked reason. */
export interface IntentPromptProps { open?: boolean; app?: string; title?: string; message?: string; waitLabel?: string; onReturn?: () => void; onWait?: () => void; onContinue?: (reason: IntentReason) => void }
export declare function IntentPrompt(props: IntentPromptProps): React.ReactElement;
// end IntentPrompt
// FullScreenFocus
export interface FullScreenFocusProps extends Omit<import('./components/ui/timer-ring').TimerRingProps, 'size' | 'stroke'> { onExit: () => void }
export declare function FullScreenFocus(props: FullScreenFocusProps): React.ReactElement;
// end FullScreenFocus
// Field
export interface FieldProps { label: string; helper?: string; error?: string }
// end Field
// CapturePad
export type InterruptionKind = 'internal' | 'external';
export interface CapturePadProps { open?: boolean; value: string; kind: InterruptionKind; onChange: (value: string) => void; onKindChange: (kind: InterruptionKind) => void; onSave: (note: { text: string; kind: InterruptionKind }) => void | Promise<void>; onClose: () => void }
export declare function CapturePad(props: CapturePadProps): React.ReactElement;
// end CapturePad
// Toast
export interface ToastProps extends Omit<InlineNoticeProps, 'variant' | 'tone'> { tone?: 'neutral' | 'warning'; onDismiss?: () => void }
export declare function Toast(props: ToastProps): React.ReactElement;
// end Toast
// KanbanColumn
export interface KanbanColumnProps { title: string; count: number; limit?: number; children?: React.ReactNode; emptyMessage?: string }
export declare function KanbanColumn(props: KanbanColumnProps): React.ReactElement;
// end KanbanColumn
// CommandPalette
export interface Command { id: string; label: string; hint?: string }
export interface CommandPaletteProps { open?: boolean; commands: Command[]; onSelect: (id: string) => void; onClose: () => void }
export declare function CommandPalette(props: CommandPaletteProps): React.ReactElement;
// end CommandPalette
// IconButton
/** label is the accessible name and the built-in Tooltip's text; the icon is aria-hidden. shortcut is one canonical glyph string, shown as a Kbd in the tooltip and set as aria-keyshortcuts (describeShortcut(shortcut).aria); pass it only while that shortcut is live. Several chords: an array (aria-keyshortcuts joins them with spaces); shortcutLabel is the text the Kbd shows when it differs (a range such as '⌘1–6'); keyshortcuts={false} shows the Kbd but sets no aria-keyshortcuts (Pause/Resume, whose key belongs to the page). aria-describedby points a disabled button at the line that says why. id, aria-haspopup, aria-expanded and aria-controls land on the button; the host sets aria-expanded and aria-controls from its menu's open state and id. */
export interface IconButtonProps { label: string; icon: React.ReactNode; shortcut?: string | string[]; shortcutLabel?: string; keyshortcuts?: boolean; size?: 'md' | 'round'; onClick?: () => void; disabled?: boolean; 'aria-haspopup'?: 'menu'; id?: string; 'aria-expanded'?: boolean; 'aria-controls'?: string; 'aria-describedby'?: string }
export declare function IconButton(props: IconButtonProps): React.ReactElement;
// end IconButton
// Tooltip
/** Wraps one focusable trigger whose accessible name holds label (an IconButton's is exactly label); the host sets that trigger's aria-keyshortcuts from describeShortcut(shortcut).aria (IconButton does this itself). The panel is aria-hidden, placed by script in the nearest open dialog or the page body. It never shows while its child has aria-expanded true (a menu trigger with its menu open), so Esc reaches the menu. */
export interface TooltipProps { label: string; shortcut?: string; placement?: 'auto'; children: React.ReactElement }
export declare function Tooltip(props: TooltipProps): React.ReactElement;
// end Tooltip
// PopoverMenu
/** One row. kind 'radio' is a menuitemradio, 'checkbox' a menuitemcheckbox (choosing it toggles: the host flips checked), 'link' a menuitem (the Settings row; a separator comes before the first link row that follows another kind). meta is the right-aligned detail ("25 / 5"). disabled gives aria-disabled: the row stays focusable and is never chosen. */
export interface PopoverMenuItem { id: string; label: string; meta?: string; kind: 'radio' | 'checkbox' | 'link'; checked?: boolean; disabled?: boolean }
/** The preset popover (PopoverMenu README). Render it only while open; the host owns open. It is a positioned panel, never the popover API: it moves into the nearest open dialog that holds anchor, or the page body, and is placed against anchor (start-aligned, below, flipped above, kept inside the viewport). It reads anchor only to place itself and to return focus (to anchor, or the first focusable element inside it); it never writes the trigger's attributes. The host sets the trigger's aria-haspopup="menu", aria-expanded (from open) and aria-controls (= id). Keys: up and down arrows (and Home, End) move, Return or Space chooses and closes, Esc or Shift+Tab closes; focus returns to the trigger. Tab closes and moves focus to the next tabbable element after the trigger (inside the open dialog that holds it, if any; none: the trigger). A press outside closes it without moving focus. readOnly: radio and checkbox rows keep their checked state and get aria-disabled; link rows stay live. No live region. */
export interface PopoverMenuProps { heading: string; description?: string; items: PopoverMenuItem[]; readOnly?: boolean; /** Called with the chosen row's id, then onClose. */ onSelect: (id: string) => void; /** Esc, Tab, a press outside, or after onSelect. The host sets open to false. */ onClose: () => void; /** The id of the role="menu" element, for the trigger's aria-controls; otherwise useId(). The heading and description use <id>-heading and <id>-desc. */ id?: string; /** The trigger, or an element that holds it (an IconButton takes no ref: wrap it in a span with the ref). */ anchor: React.RefObject<HTMLElement | null>; /** true: the heading row shows P as an aria-hidden Kbd, and the host adds P to the trigger's aria-keyshortcuts. Omitted or false: neither. Pass it only while single-key shortcuts are on; the menu never listens for P. */ singleKeys?: boolean }
export declare function PopoverMenu(props: PopoverMenuProps): React.ReactElement;
// end PopoverMenu
// Shared: window.Orasenda
declare global {
  interface Window {
    Orasenda: {
      ModeChip: typeof import("./components/ui/mode-chip").ModeChip; TimerRing: typeof import("./components/ui/timer-ring").TimerRing; TimerStrip: typeof import("./components/ui/timer-strip").TimerStrip; timerLayout: typeof import("./lib/timer-layout").timerLayout;
      TaskCard: typeof TaskCard; HabitDots: typeof import("./components/ui/habit-dots").HabitDots;
      IntentPrompt: typeof IntentPrompt; Dialog: typeof import("./components/ui/dialog").Dialog; FullScreenFocus: typeof FullScreenFocus;
      TextArea: typeof import("./components/ui/text-area").TextArea; CapturePad: typeof CapturePad; InlineNotice: typeof import("./components/ui/inline-notice").InlineNotice; Toast: typeof Toast;
      NavRail: (props: { current: "today" | "board" | "calendar" | "routines" | "review" | "settings"; onNavigate: (page: "today" | "board" | "calendar" | "routines" | "review" | "settings") => void }) => React.ReactElement; KanbanColumn: typeof KanbanColumn; CommandPalette: typeof CommandPalette;
      StartButton: typeof import("./components/ui/start-button").StartButton; NowLine: (props: { time: string }) => React.ReactElement;
      ScrollRegion: (props: { label: string; children?: React.ReactNode }) => React.ReactElement; SettingsRow: typeof import("./components/ui/settings-row").SettingsRow;
      IconButton: typeof IconButton; Tooltip: typeof Tooltip; Kbd: (props: { keys: string } & ({ inTooltip: true; spoken?: string } | { inTooltip?: false; spoken: string })) => React.ReactElement; describeShortcut: (glyphs: string) => { aria: string; spoken: string }; PopoverMenu: typeof PopoverMenu;
      /** Set by the host, before or after bundle.js runs. true: describeShortcut throws on an unknown glyph string (tests, specimens). Otherwise it passes the glyphs through and warns once per call. */
      strictShortcuts?: boolean;
    };
  }
}
// end Shared: window.Orasenda
