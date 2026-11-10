The current-time rule on the day calendar: the word "Now", the clock time and a 1px `focus` line with a dot.

- `time`: a locale-formatted clock time without seconds, in `timer-sm`. The host updates it each minute without announcing.
- `compact` for week lanes: a 2px `focus` rule without the label. Today's week head carries the visible word "Today" on its own line (`body-sm` weight 600, `focus` on `selection`, 4.86 / 6.43), so today is never marked by ground or weight alone.

Do: place it between blocks at the current time. Don't: use it as a focus indicator or give it seconds.
