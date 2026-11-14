The slim left rail: Today, Inbox, Board, Calendar, Routines, Review, Settings.

- `current`: one of `today`, `inbox`, `board`, `calendar`, `routines`, `review`, `settings`. `onNavigate(page)` is called on activation.
- Every item shows an `Icon` (today, inbox, board, calendar, routines, review, settings) and a label; the current page has `aria-current="page"`, a `selection` ground and a `focus` side bar. Items are 52px tall in a 64px rail.
- **Keyboard:** the rail is one tab stop with roving focus: the stop sits on the current page's item and follows focus while it is inside the rail, ↑/↓ move (wrapping), Return or Space activates, Tab leaves, and `aria-current` stays on the current page. ⌘1–7 go to a page from anywhere.
- **Compact and strip layouts:** the rail is hidden and a Pages `IconButton` (tooltip "Pages", ⌘1–7) opens a native menu with the pages and Commands….

Do: move focus to the new screen's heading after navigating. Don't: collapse to icons only, or add badges.
