The always-on-top mini window (`floating-timer.tsx`) that keeps time visible over other apps.

- **Anatomy:** `MenuBarTimer` with `compact: false` (`timer-md` digits and the mode shape; its task line is hidden here and joins in P2) beside Pause/Resume and Open Orasenda, both `md` `IconButton`s, always visible. The panel owns the fill and the edge (the inner `MenuBarTimer` drops its own border, ground and shadow here). Opaque `surface-raised` fill, a 1px `line-strong` edge in both themes, `radius-md`, `shadow-raised`. No close button. It fills its window between the `floater-*` tokens (default 280 × 64, minimum 280 × 56, maximum 360 × 96) and never switches to the strip or changes layout by shape. From 88px tall the state word of a running session sits on its own line under the digits (measured by a `ResizeObserver` on the floater); below that it is spoken only.
- **Props:** `MenuBarTimer` props without `compact` (`remaining`, `remainingLabel`, `progress`, `mode`, `task`), plus `onPause`, `onResume`, `onStart`, `onOpen`, `ended`, `onSkipBreak`, `onKeepGoing`, `keepGoingName` and any `data-*` attribute. The last three are optional: without them every state is as before.
- **Break actions (host-driven):** with `mode="break"` and `onSkipBreak`, a quiet "Skip break" `Button` (`body-sm`; the gaps in the panel narrow from `space-2` to `space-1` while it shows) takes Pause's slot; the break has no Pause here, the host's Focus window and Today keep it. While idle or ended with `onKeepGoing`, a primary "Keep going" pill (play glyph) takes the Start pill's slot, named "Keep going with <keepGoingName>" ("Keep going" without a name), and the visible "No session" or "Session ended." word is dropped to make room; the timer keeps its idle name and shape, and the live "Session ended." status still speaks. Without the props Pause and Start are as before.
- **`data-*`:** every `data-*` prop lands on the body, the `role="group"` element, so the host marks the drag region (`data-tauri-drag-region`) without the component knowing Tauri. Always-on-top, the window frame, which parts drag and the context menu are the host's.
- **States:** running (focus: the draining ring); paused (bars; Resume in Pause's place); warning (`amber` triangle); break (half circle); deep (a long session: "1:30:00" fits at the minimum size); idle (hollow circle, "No session" in `ink-muted` `body-sm`, and the Start pill in Pause's slot: the play glyph and "Start" at `space-3` padding, accessible name "Start focus"); ended (`ended`: as idle, with "Session ended." in `ink`). Every state has its shape, and idle and ended their word: never colour alone.
- **Widths at the minimum (280):** deep: 12 + 14 + 6 + about 118 + 8 + 44 + 8 + 44 + 8 ≈ 262. Ended: 12 + 14 + 6 + about 91 + 8 + about 82 + 8 + 44 + 8 ≈ 273. The buttons are `hit-min` (44 × 44) at 280 × 56.
- **Widths of the break actions at the minimum (280):** skip break: 12 + about 113 (shape, digits and word) + 4 + about 89 + 4 + 44 + 12 = 278, plus the 1px edges. Keep going: 12 + about 68 + 8 + about 126 + 8 + 44 + 12 = 278, plus the edges. Their targets are `hit-min` (44 × 44) at 280 × 56. A break is shown in `mm:ss`; an hour-long break would not fit beside Skip break at the minimum.
- **"Session ended." is announced once** by the floater's one live region: an always-mounted, visually hidden `role="status"` paragraph inside the body that holds "Session ended." while `ended` and is empty otherwise (planner decision 8). The floater is its own window, so no page status can announce for it. The visible word is `aria-hidden`, the timer stays `aria-live="off"`, and nothing else in the floater is live.
- **Keyboard:** Tab moves Pause/Resume (or Start, Skip break or Keep going) → Open Orasenda. The panel's own keys (Space on the body, Return, Esc) and its native context menu (Close, which hides the floating timer, and Start focus while idle or ended) are the host's.
- **VoiceOver:** a group named "Floating timer, <state>" ("Floating timer, Focus", "Floating timer, Almost up", "Floating timer, No session", "Floating timer, Session ended"); inside it the timer's name from `MenuBarTimer` ("Focus, 18 minutes 42 seconds remaining"); the buttons "Pause session" or "Resume session", or "Start focus", "Skip break" or "Keep going with <name>", and "Open Orasenda".

## The edge against the desktop

The boundary is shared by fill and edge: in every theme × wallpaper combination at least one of the two holds 3:1. Measure controls against the floater's own fill.

| Wallpaper | Light theme (fill / edge) | Dark theme (fill / edge) |
| --- | --- | --- |
| light #EDEDED | 1.15 / **4.15** | **13.52** / 2.71 |
| mid-grey #808080 | **3.89** / 1.23 | **4.01** / 1.25 |
| dark #1C1C1E | **16.75** / 3.50 | 1.08 / **5.37** |

The fill and the edge are the same in every state, so the table holds for running, paused, warning, idle, ended, deep and break.

Do: measure control contrast against the floater's own fill. Don't: add a task title at the minimum size, or a close button inside the panel; closing lives in the context menu and the menu bar.
