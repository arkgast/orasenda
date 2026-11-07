A block on the day calendar, sized by its duration at 2px per minute.

- `type`: `deep`, `shallow`, `break`, `routine`, `personal` or `overflow` (hatched side strip, text never sits on the hatch). `title`, `start`, `end`.
- `height`: a number of pixels or a px string. Below 60px the block becomes one line (title · start); the floor is 24px. Pass `compact` yourself for non-pixel heights.
- `now`: a `focus` bar on the left and the word "Now". It never reuses the keyboard outline. `selected`: dashed border and the word "Selected".
- `onSelect` makes the block a native button; the host's editor provides keyboard reschedule.

Do: place `NowLine` separately at the current time. Don't: overlap short blocks to enlarge hit areas.
