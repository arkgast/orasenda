The time on Today and in the Focus window when the window is a strip: digits over a horizon bar.

- **When:** the content box is wider than twice its height and shorter than `layout-strip-height`, or shorter than `layout-ring-min-height` at `layout-compact-width` or wider; below that width it is the stacked strip. Layout switches on resize only. The floater never uses it (`FloatingTimer`).
- **Anatomy:** digits (`timer-lg` scaled to the strip, never below `timer-md`, `ink`) over a horizon bar in a 10px box: a 2px `line-strong` track and a 6px fill that shows time left (three times the track, as in the ring, so the fill end reads by thickness, not colour), plus a 10px `amber` triangle at the fill's end when almost up.
- **Props:** as `TimerRing` (`remaining`, `remainingLabel`, `progress`, `mode`) plus `idleLength` ("25 min").
- **States:** focus (fill `focus`); paused (fill `ink-muted`, frozen); warning (fill `amber` plus the triangle; the colour fades over `duration-slow`, the triangle and the chip's word switch at once); idle (no bar; `idleLength` in `ink-muted` at `timer-md`, never fake digits).
- **Keyboard:** none; it is not a control.
- **VoiceOver:** `role="timer"`, `aria-live="off"`, the name from `remainingLabel`, as `TimerRing`.
- **Contrast:** track and every fill hold 3:1 on `surface` in both themes (`line-strong` 4.35 / 5.56, `focus` 5.31 / 8.74, `ink-muted` 5.36 / 7.52, `amber` 5.51 / 9.53). Fill against track is not relied on.

Do: keep the `ModeChip` beside it as the state word. Don't: let the digits shrink below `timer-md`, or colour the track.
