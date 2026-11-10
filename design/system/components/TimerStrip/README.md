The time on Today and in the Focus window when the window is a strip: the state chip and digits over a horizon bar.

- **When:** `timerLayout` returns `strip` or `stackedStrip` (see "Choosing the layout" below). Layout switches on resize only. The floater never uses it (`FloatingTimer`).
- **Anatomy:** a `ModeChip` (the state word and shape, as inside the ring) beside the digits (`timer-lg` scaled to the strip's width, never below `timer-md`, `ink`; `ink-muted` while paused), over a horizon bar in a 10px box: a 2px `line-strong` track and a 6px fill that shows time left (three times the track, as in the ring, so the fill end reads by thickness, not colour), plus a 10px `amber` triangle at the fill's end when almost up. Under it, the `task` line.
- **Props:** as `TimerRing` (`remaining`, `remainingLabel`, `progress`, `mode`) plus `idleLength` ("25 min"), `task` and `stacked`.
- **`task`:** E's intent line ("What will be done?"), the same slot as the ring's `task`: `body-sm` in `ink-muted`, clamped to two lines, kept whole in the accessible name.
- **`stacked`:** the narrow form for `stackedStrip`: centred, the chip beside the digits (digits from `timer-md`, about 36px at 360 wide), `space-1` between that head and the bar, the bar across the full width. On Today it takes no `task` (see "Today's stacked strip" below). Without `stacked` the strip is start-aligned, keeps `space-2` between its rows, and its digits grow to `timer-lg`.
- **States:** focus (fill `focus`); break (fill `break`, half-filled circle); paused (fill `ink-muted`, frozen; digits `ink-muted`); warning (fill `amber` plus the triangle; the fill and chip colour fade over `duration-slow`, the triangle and the chip's word switch at once); idle (no bar; `idleLength` in `ink-muted` at `timer-md`, never fake digits).
- **Keyboard:** none; it is not a control.
- **VoiceOver:** `role="timer"`, `aria-live="off"` (no live region); the name is the mode word, `remainingLabel` and the task: "Almost up, 1 minute 48 seconds remaining, Finish the chapter 3 outline". Idle: "No session, 25 min".
- **Contrast:** track and every fill hold 3:1 on `surface` in both themes (`line-strong` 4.35 / 5.56, `focus` 5.31 / 8.74, `ink-muted` 5.36 / 7.52, `amber` 5.51 / 9.53; `break` as the ring's break arc). Fill against track is not relied on.

Do: let the strip's own chip be the state word; the host's state column holds only the status line. Don't: add a second chip, let the digits shrink below `timer-md`, or colour the track.

## Today's stacked strip

The timer-surfaces canvas (a-timer) draws Today at 360 × 240 as 188px of fixed tracks plus a 52px time track, and the stacked strip must fit that track.

- **What fits:** the head (digits about 36px at 360 wide, the 28px chip centred beside them), `space-1`, and the 10px bar: 50px. Idle is the chip and `idleLength` alone, 32px.
- **No intent:** Today passes no `task` to its stacked strip. Two clamped lines would add 40px and overflow the track. The ring and the wide strip show the intent again when the window grows. The accessible name then has the mode word and the time only.
- **The wide strip:** `strip` keeps `space-2` and the `task` line.
- **Test:** a host test sizes the stacked strip's frame to the 52px time track and checks that the strip's height is no more than the frame's height in every state.

## Choosing the layout

`timerLayout({ contentWidth, contentHeight, windowWidth })` returns `"ring"`, `"strip"` or `"stackedStrip"`. It is pure, exported from the bundle, and called on resize only, never on a tick. Today's host measures its box and calls it; `FullScreenFocus` measures its own box and calls it internally.

- **Rule:** if `contentHeight` is under `layout-ring-min-height` (360), `strip` when `windowWidth` is at least `layout-compact-width` (640), else `stackedStrip`. Otherwise, if `contentWidth` is more than twice `contentHeight` and `contentHeight` is under `layout-strip-height` (420), `strip`. Otherwise `ring`. The constants are those tokens' values (`timerLayout.tokens`).
- **Today's box:** the Today stage, which is the window's content area, as the timer-surfaces canvas (a-timer) measures it: its 360 holds the fixed 44 top, 44 status and 52 controls tracks plus a 160 ring. So on Today `contentWidth` and `contentHeight` are the window's inner size.
- **The Focus window's box:** the window minus `space-8` in each dimension, or minus `space-4` below `layout-compact-width`.
- `windowWidth` is the window's inner width, used only for the compact test.

| Surface | Window | contentWidth | contentHeight | windowWidth | Result |
| --- | --- | --- | --- | --- | --- |
| Today | 360 × 240 | 360 | 240 | 360 | stackedStrip |
| Today | 360 × 360 | 360 | 360 | 360 | ring (compact ring 172) |
| Today | 640 × 330 | 640 | 330 | 640 | strip |
| Today | 640 × 480 | 640 | 480 | 640 | ring |
| Today | 900 × 240 | 900 | 240 | 900 | strip |
| Today | 900 × 600 | 900 | 600 | 900 | ring |
| Today | 1000 × 440 | 1000 | 440 | 1000 | ring (compact ring) |
| Today | 1440 × 900 | 1440 | 900 | 1440 | ring |
| Today | 3440 × 400 | 3440 | 400 | 3440 | strip |
| Focus window | 360 × 240 | 344 | 224 | 360 | stackedStrip |
| Focus window | 360 × 360 | 344 | 344 | 360 | stackedStrip |
| Focus window | 640 × 330 | 576 | 266 | 640 | strip |
| Focus window | 640 × 480 | 576 | 416 | 640 | ring |
| Focus window | 900 × 240 | 836 | 176 | 900 | strip |
| Focus window | 900 × 600 | 836 | 536 | 900 | ring |
| Focus window | 1000 × 440 | 936 | 376 | 1000 | strip |
| Focus window | 1280 × 720 | 1216 | 656 | 1280 | ring |
| Focus window | 1440 × 900 | 1376 | 836 | 1440 | ring |
| Focus window | 1920 × 1080 | 1856 | 1016 | 1920 | ring |
| Focus window | 3440 × 400 | 3376 | 336 | 3440 | strip |

Today at 360 × 360 and 1000 × 440 is a compact ring, as the canvas draws them: a 360-tall content box holds the fixed tracks and a ring of at least `timer-min-size`.
