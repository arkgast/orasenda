The countdown ring. The arc shows what is left, not what is spent: full at the start, empty at the end.

- `progress`: elapsed fraction from 0 to 1 (clamped). `remaining`: the digits ("18:42"). `remainingLabel`: the spoken form ("18 minutes 42 seconds") used in the accessible name.
- `mode`: `focus`, `break`, `routine`, `warning` at two minutes, `paused` (arc frozen, `ink-muted`), `idle` (no digits, "No session").
- `size`: 280 on Today, 560 inside `FullScreenFocus`. `stroke` defaults to size / 40; the track is a third of that.
- `task` is clamped to two lines visually and kept whole in the accessible name. `clock` adds a small wall clock.

Do: switch to `warning` once and let the colour change over `duration-calm`. Don't: announce every tick; the ring is `role="timer"` with `aria-live="off"`.
