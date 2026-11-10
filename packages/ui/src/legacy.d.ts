// Shared: React import and modes
import type * as React from 'react';
import type { InlineNoticeProps } from "./components/ui/inline-notice";
export type Mode = 'focus' | 'break' | 'routine' | 'warning' | 'shallow' | 'paused' | 'idle';
export type TimerMode = Exclude<Mode, 'shallow'>;
// end Shared: React import and modes
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
// Shared: window.Orasenda
declare global {
  interface Window {
    Orasenda: {
      ModeChip: typeof import("./components/ui/mode-chip").ModeChip; TimerRing: typeof import("./components/ui/timer-ring").TimerRing; TimerStrip: typeof import("./components/ui/timer-strip").TimerStrip; timerLayout: typeof import("./lib/timer-layout").timerLayout;
      TaskCard: typeof import("./components/ui/task-card").TaskCard; HabitDots: typeof import("./components/ui/habit-dots").HabitDots;
      IntentPrompt: typeof IntentPrompt; Dialog: typeof import("./components/ui/dialog").Dialog; FullScreenFocus: typeof FullScreenFocus;
      TextArea: typeof import("./components/ui/text-area").TextArea; CapturePad: typeof CapturePad; InlineNotice: typeof import("./components/ui/inline-notice").InlineNotice; Toast: typeof Toast;
      NavRail: (props: { current: "today" | "board" | "calendar" | "routines" | "review" | "settings"; onNavigate: (page: "today" | "board" | "calendar" | "routines" | "review" | "settings") => void }) => React.ReactElement; KanbanColumn: typeof KanbanColumn; CommandPalette: typeof CommandPalette;
      StartButton: typeof import("./components/ui/start-button").StartButton; NowLine: (props: { time: string }) => React.ReactElement;
      ScrollRegion: (props: { label: string; children?: React.ReactNode }) => React.ReactElement; SettingsRow: typeof import("./components/ui/settings-row").SettingsRow;
      IconButton: typeof IconButton; Tooltip: typeof import("./components/ui/tooltip").Tooltip; Kbd: (props: { keys: string } & ({ inTooltip: true; spoken?: string } | { inTooltip?: false; spoken: string })) => React.ReactElement; describeShortcut: (glyphs: string) => { aria: string; spoken: string }; PopoverMenu: typeof import("./components/ui/popover-menu").PopoverMenu;
      /** Set by the host, before or after bundle.js runs. true: describeShortcut throws on an unknown glyph string (tests, specimens). Otherwise it passes the glyphs through and warns once per call. */
      strictShortcuts?: boolean;
    };
  }
}
// end Shared: window.Orasenda
