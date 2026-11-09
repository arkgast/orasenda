A board column: a `surface-sunken` well with a heading, a count and the cards.

- `title`, `count` (actual tasks), `limit` (the WIP policy the user chose). Below the limit the count is a neutral caption ("1 of 3"). At the limit it is a `warning` chip reading "At limit"; above it the chip reads "4 of 3". Never a red badge.
- `collapsed` with `onToggle` folds the column into a `column-strip-width` strip (`surface-sunken`, `radius-lg`) with a chevron, the name and the count, and `aria-expanded`. Hover: the chevron and count turn `ink` and an inset 1px `line-strong` edge appears; pressed: `selection`.
- Expanded columns are fluid between `column-min-width` and `column-width` with `space-2` gaps. Opening a strip folds the least recently opened column, never the one holding the running task, and moves focus to the opened column's first card (or its heading when empty). Columns fold in one order everywhere: Doing, Today, Inbox, Backlog; Done starts folded. The board never scrolls sideways.
- `children` are `TaskCard`s; `emptyMessage` defaults to "Nothing here yet. That's fine."

Do: keep adding tasks possible past the limit; the limit informs, it does not block. Don't: implement drag here; the card editor provides keyboard move.
