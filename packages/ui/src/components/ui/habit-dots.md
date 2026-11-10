The calm dot grid for a habit. A missed day is a hollow dot, not a break in a chain.

- `days`: `{ state, today?, label? }` where `state` is `done` (solid `break`), `skipped` (hollow circle), `rest` (dashed) or `future` (dotted rounded square). `today` draws an independent `focus-ring` around whichever state the day has, so "today, done" exists. `label` is a localised date for the spoken name. A bare state string is also accepted.
- `legend` prints the shapes with their words once per screen.
- `note` is the habit's two-minute version or reminder. `restartNote` is what the host passes after two skipped days, in `ink-muted`: "Two days off. Today is a fresh start."

Do: keep dots as `role="img"` with labels; they are not controls. Don't: say "missed", "broken" or "streak lost" anywhere near this.
