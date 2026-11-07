A board column: a `surface-sunken` well with a heading, a count and the cards.

- `title`, `count` (actual tasks), `limit` (the WIP policy the user chose). Below the limit the count is a neutral caption ("1 of 3"). At the limit it is a `warning` chip reading "At limit"; above it the chip reads "4 of 3". Never a red badge.
- `children` are `TaskCard`s; `emptyMessage` defaults to "Nothing here yet. That's fine."

Do: keep adding tasks possible past the limit; the limit informs, it does not block. Don't: implement drag here; the card editor provides keyboard move.
