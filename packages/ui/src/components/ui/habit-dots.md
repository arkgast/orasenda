The calm dot grid for a habit. A day not done is a hollow dot, not a gap in a chain.

- `days`: `{ state, today?, label?, weekday? }` where `state` is `done` (solid `break`), `skipped` (hollow circle, spoken "Not done"), `rest` (dashed) or `future` (dotted rounded square). `today` draws an independent `focus-ring` around whichever state the day has, so "today, done" exists. `label` is a localised date for the spoken name. `weekday` is 0 for Monday to 6 for Sunday; only the first day's is read, for the week layout. A bare state string is also accepted.
- `columns="week"`: rows of seven aligned to Monday, so the same weekday stacks. A weekday header (M T W T F S S, `label` in `ink-muted`) sits above the dots, each letter `aria-hidden` on its own cell; the dots keep their spoken dates. Empty `aria-hidden` cells fill the first row up to the first day's `weekday`. Without `columns` the dots wrap on one line, as before.
- `runLine` is the run of days in words, from the host ("5 days kept"), directly under the grid in `body-sm` `ink-muted`. Never a big number or a flame.
- `legend` prints the shapes with their words once per screen.
- `compact` draws the grid alone, for a host that lists several habits as rows (the Review Stats Week range): no visible name, weekday header or run line; `name` still names the group ("Stretch, daily record"). The host prints the name and its line beside the grid, one `HabitWeekdays` (the M–S header, `aria-hidden`, cells one `icon-md` wide so it lines up with the grids under it) above the list and one `HabitLegend` after it. Put the header and every grid at the same edge.
- `note` is the habit's two-minute version or reminder. `restartNote` is the fresh-start line the host passes after two days in a row not done, in `ink-muted`: "Two days off. Today is a fresh start." The host shows `runLine` or `restartNote`, not both.

The Routines page uses `columns="week"` with 28 days at `size-icon-md` with `gap-fluid-stack`, which fit the compact window: four calm rows when the window starts on a Monday, five when the first row has a leading gap.

Do: keep dots as `role="img"` with labels; they are not controls. Don't: put words of loss, blame or counting down near this; the copy rules in the design-system README apply.
