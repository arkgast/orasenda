The slim left rail: Today, Board, Calendar, Routines, Review, Settings.

- `current`: one of `today`, `board`, `calendar`, `routines`, `review`, `settings`. `onNavigate(page)` is called on activation.
- Every item shows an icon and a label; the current page has `aria-current="page"`, a `selection` ground and a `focus` side bar. Items are 52px tall in a 64px rail.

Do: move focus to the new screen's heading after navigating. Don't: collapse to icons only, or add badges.
