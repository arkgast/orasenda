A task on the board. Sessions beyond the estimate are information, never a warning.

- `title`, `type` (`deep` default or `shallow`), `project`, `frog` (the one hardest task of the day, shown as the word "Frog").
- `estimate` and `done` in sessions, `tracked` as a duration ("0h 41m"). The meta line reads "Est 3 · Done 1 · 0h 25m"; with no estimate it reads "No estimate". Dots cap at twelve; sessions past the estimate are the same `focus` dot with a thin halo.
- `due` (worded by the host: "Due Friday"), `priority` (`high`, `medium`, `low`, shown as a word), `tags` (up to two shown) and `checklist` ("2 of 5") sit on the card. All of them are in the accessible name, so VoiceOver reads the same facts.
- `onOpen` makes the card a native button. Without `onOpen` or `onSelect` the card is a read-only article with no tab stop.
- `onSelect` beside `onOpen`: a click selects (`selection` + "Selected"); Return or a double-click opens. Arrow keys come through `onKeyDown` (passed through untouched after the card's own Return rule), so the board moves the selection. `onSelect` alone makes a button that selects. Hover is `surface-sunken` only, never the selection ground.
- `density="row"` (TaskRow): a single line, at least `hit-min` tall, with the type shape, the title (ellipsis, kept whole in the name), the Frog and state words and the estimate in `timer-sm`. It drops the dots, tags and checklist. A read-only form (no button) serves the shutdown preview.
- `menu` adds a "More actions for <title>" icon button beside the card (never inside its button) that opens a `PopoverMenu`: "Move to <column>" for each of `moveTargets` (`onMove(id)`), "Make Frog" or "Unmark Frog" (`onFrog`), and "Remove" (`onRemove`). Items without a callback are left out. It is the keyboard route to move a task; there is no drag here.
- `active` means a session is running on it: a `focus` bar and the words "In progress". `selected` is a separate state: `selection` ground and the word "Selected".

Do: let the column set the width. Don't: colour anything amber here, or show ratios of done to estimated.
