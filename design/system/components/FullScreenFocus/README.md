The Focus window: a fluid ring with large tabular digits, the task, a small wall clock and one quiet way out.

- Takes `TimerRing` props (`remaining`, `remainingLabel`, `progress`, `mode`, `task`, `clock`) plus `onExit`. The ring is `size="fluid"`; when the window is a strip it shows `TimerStrip`.
- Leave full screen is a top-right `IconButton` (Esc). It opens the `Dialog` "Leave full screen?" / "Your focus session will keep running." with "Stay in full screen" as the initial focus. `onExit` fires only after confirmation.
- The same controls row as Today: Pause/Resume and End. An idle state shows the summary, the preset `PopoverMenu` (no Settings row) and Start.
- Caption "Space pauses · Esc leaves" while single-key shortcuts are on; "⌘. ends · Esc leaves" when they are off.
- Stays open at the end with "Session ended."
- It is a borderless window per display, not macOS native full screen. The layout takes focus on mount so Escape works at once; margins are `space-8`, `space-4` on narrow windows.

Do: keep the menu-bar timer running underneath. Don't: add anything else to this screen.
