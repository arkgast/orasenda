// Shared: React import and modes
import type * as React from 'react';
export type Mode = 'focus' | 'break' | 'routine' | 'warning' | 'shallow' | 'paused' | 'idle';
export type TimerMode = Exclude<Mode, 'shallow'>;
// end Shared: React import and modes
// FullScreenFocus
export interface FullScreenFocusProps extends Omit<import('./components/ui/timer-ring').TimerRingProps, 'size' | 'stroke'> { onExit: () => void }
export declare function FullScreenFocus(props: FullScreenFocusProps): React.ReactElement;
// end FullScreenFocus
// Field
export interface FieldProps { label: string; helper?: string; error?: string }
// end Field
// CommandPalette
export interface Command { id: string; label: string; hint?: string }
// end CommandPalette
// Shared: window.Orasenda
declare global {
  interface Window {
    Orasenda: {
      ModeChip: typeof import("./components/ui/mode-chip").ModeChip; TimerRing: typeof import("./components/ui/timer-ring").TimerRing; TimerStrip: typeof import("./components/ui/timer-strip").TimerStrip; timerLayout: typeof import("./lib/timer-layout").timerLayout;
      TaskCard: typeof import("./components/ui/task-card").TaskCard; HabitDots: typeof import("./components/ui/habit-dots").HabitDots;
      IntentPrompt: typeof import("./components/ui/intent-prompt").IntentPrompt; Dialog: typeof import("./components/ui/dialog").Dialog; FullScreenFocus: typeof FullScreenFocus;
      TextArea: typeof import("./components/ui/text-area").TextArea; CapturePad: typeof import("./components/ui/capture-pad").CapturePad; InlineNotice: typeof import("./components/ui/inline-notice").InlineNotice; Toast: typeof import("./components/ui/toast").Toast;
      NavRail: (props: { current: "today" | "board" | "calendar" | "routines" | "review" | "settings"; onNavigate: (page: "today" | "board" | "calendar" | "routines" | "review" | "settings") => void }) => React.ReactElement; KanbanColumn: typeof import("./components/ui/kanban-column").KanbanColumn; CommandPalette: typeof import("./components/ui/command-palette").CommandPalette;
      StartButton: typeof import("./components/ui/start-button").StartButton; NowLine: (props: { time: string }) => React.ReactElement;
      ScrollRegion: (props: { label: string; children?: React.ReactNode }) => React.ReactElement; SettingsRow: typeof import("./components/ui/settings-row").SettingsRow;
      IconButton: typeof import("./components/ui/icon-button").IconButton; Tooltip: typeof import("./components/ui/tooltip").Tooltip; Kbd: (props: { keys: string } & ({ inTooltip: true; spoken?: string } | { inTooltip?: false; spoken: string })) => React.ReactElement; describeShortcut: (glyphs: string) => { aria: string; spoken: string }; PopoverMenu: typeof import("./components/ui/popover-menu").PopoverMenu;
      /** Set by the host, before or after bundle.js runs. true: describeShortcut throws on an unknown glyph string (tests, specimens). Otherwise it passes the glyphs through and warns once per call. */
      strictShortcuts?: boolean;
    };
  }
}
// end Shared: window.Orasenda
