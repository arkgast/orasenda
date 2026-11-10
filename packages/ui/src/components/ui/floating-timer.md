The always-on-top mini window that keeps time visible over other apps.

- **Anatomy:** `MenuBarTimer` with `compact: false`, plus Pause/Resume and Open Orasenda `IconButton`s, always visible; `surface-raised` fill, a 1px `line-strong` edge in both themes, `shadow-raised`; the body is the drag region. From 88px tall the state word sits on its own line. It is its own composition sized by the `floater-*` tokens (default 280 × 64, minimum 280 × 56, maximum 360 × 96) and never switches to the strip layout or changes layout by shape.
- **Props:** `MenuBarTimer` props plus `onPause`, `onResume`, `onStart`, `onOpen`.
- **States:** running; paused; warning; idle (hollow circle, "No session" in `ink-muted` `body-sm`, and a Start pill with the play glyph and "Start" at `space-3` padding in Pause's slot, accessible name "Start focus"); ended (as idle, with "Session ended." announced once); deep (1:30:00 fits at the minimum size).
- **Keyboard:** Tab through the controls. The native context menu has Close (Hide floating timer) and, while idle or ended, Start focus.
- **VoiceOver:** a group named "Floating timer, <state>" ("Floating timer, No session").

## The edge against the desktop

The boundary is shared by fill and edge: in every theme × wallpaper combination at least one of the two holds 3:1. Measure controls against the floater's own fill.

| Wallpaper | Light theme (fill / edge) | Dark theme (fill / edge) |
| --- | --- | --- |
| light #EDEDED | 1.15 / **4.15** | **13.52** / 2.71 |
| mid-grey #808080 | **3.89** / 1.23 | **4.01** / 1.25 |
| dark #1C1C1E | **16.75** / 3.50 | 1.08 / **5.37** |

Do: measure control contrast against the floater's own fill. Don't: add a task title at the minimum size, or a close button inside the panel; closing lives in the context menu and the menu bar.
