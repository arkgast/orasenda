What replaces a planning page's primary while a session runs: the time and one Pause button.

- **Anatomy:** a compact `MenuBarTimer` (`timer-sm` digits and the mode shape) and a 44 × 44 Pause `IconButton` (tooltip "Pause session" with ⌃⌥F) in a `surface-raised` pill with an inset 1px `line-strong` edge.
- **Props:** `MenuBarTimer` props, `onPause`, `onResume`.
- **VoiceOver:** the timer keeps its spoken name; the button's name changes with the state ("Pause session", "Resume session").

Do: keep it at the header's end, where the primary was. Don't: add End here; ending belongs to Today, the menu bar and ⌘.
