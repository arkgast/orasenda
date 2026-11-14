The Settings pane list: seven panes, shown as a side list or, at compact width, a tab strip.

- `items`: `{ id, name }[]`. `current`: the id of the open pane. `orientation`: `"vertical"` or `"horizontal"`.
- `onSelect(id, via)` is called on activation; `via` is `"keyboard"` when Return or Space did it and `"pointer"` otherwise. The host moves focus to the pane heading only for `"keyboard"`; with the pointer, the item takes focus itself (WKWebView does not focus a clicked button).
- A `nav` named "Settings" holding a list of buttons (`ul` and `li`). The current item has `aria-current="page"`, shown by shape too: a `focus` side bar and `selection` ground (vertical), or a `focus` underline (horizontal), plus a semibold name.
- Vertical: when the list is taller than its space (a short window), the nav scrolls on its own, with room around the items for the focus ring.
- **Keyboard:** one tab stop (the current item, following focus while inside). Vertical: ↑ and ↓ move. Horizontal: ← and → move. Home and End jump; moving does not select. Tab leaves.
- **Vertical:** a column of `index-width`, items at least `hit-min` tall.
- **Horizontal:** a strip that scrolls sideways when the names don't fit. Edge buttons "Earlier panes" and "More panes" (chevron rotated, `hit-min` square, `tabindex="-1"`, so not tab stops) keep their slots and show (otherwise `invisible`, `disabled`, `aria-hidden`) only on the side that has more, and scroll the strip by about three quarters of its width. Scrolling is instant under reduce-motion. The strip pads by one space step so the focus ring is not clipped. The edge buttons are `IconButton`s with `tabIndex={-1}`, so they are out of the tab order but show a tooltip with their names to pointer users. Keyboard users reach every tab by arrows, which scroll the focused tab into view.

Do: keep it sticky beside or above the pane. Don't: show a menu, add badges, or mark the current item by colour alone.
