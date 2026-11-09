The countdown ring. The arc shows what is left, not what is spent: full at the start, empty at the end.

- `progress`: elapsed fraction from 0 to 1 (clamped). `remaining`: the digits ("18:42"). `remainingLabel`: the spoken form ("18 minutes 42 seconds") used in the accessible name.
- `mode`: `focus`, `break`, `routine`, `warning` at two minutes, `paused` (arc frozen, `ink-muted`), `idle` (no digits, "No session").
- `size`: 280 (`timer-size`) at the default window, 560 (`timer-full-size`) as the largest, or `"fluid"`: sized by its container between `timer-min-size` and `timer-full-size`, digits scaled with the diameter and never below `timer-md`. `stroke` defaults to size / 40; the track is a third of that.
- `task` is clamped to two lines visually and kept whole in the accessible name. `clock` adds a small wall clock in `timer-sm`.
- When the window is a strip, Today and the Focus window show `TimerStrip` instead.

Do: switch to `warning` once. The word and the triangle switch at once; the arc and chip colour fade over `duration-slow`; under reduced motion it is instant. Don't: announce every tick; the ring is `role="timer"` with `aria-live="off"`.
