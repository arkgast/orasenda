A task on the board. Sessions beyond the estimate are information, never a warning.

- `title`, `type` (`deep` default or `shallow`), `project`, `frog` (the one hardest task of the day).
- `estimate` and `done` in sessions, `tracked` as a duration ("0h 41m"). The meta line reads "Est 3 · Done 1 · 0h 25m"; with no estimate it reads "No estimate". Dots cap at twelve; sessions past the estimate are the same `focus` dot with a thin halo.
- `onOpen` makes the card a native button. Without it the card is a read-only article with no tab stop.
- `onSelect` beside `onOpen`: a click or an arrow key selects (`selection` + "Selected"); Return, a double-click or the context menu's Open opens. Hover is `surface-sunken` only, never the selection ground.
- `density="row"` (TaskRow): a 44px single line with the type shape, the title (ellipsis, kept whole in the name), the state word and the estimate in `timer-sm`. A read-only form (no button) serves the shutdown preview.
- `active` means a session is running on it: a `focus` bar and the words "In progress". `selected` is a separate state: `selection` ground and the word "Selected".

Do: let the column set the width. Don't: colour anything amber here, or show ratios of done to estimated.
