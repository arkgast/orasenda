The only scrolling box on a list page; the page itself never scrolls.

- **Anatomy:** the `minmax(0, 1fr)` track of a `PageFrame`; an always-drawn scrollbar so macOS overlay scrollbars never hide it (a `scrollbar-size` track, a 6px `line-strong` thumb at least `hit-floor` long, a clear track; `overflow-y: scroll` keeps the gutter stable); a 1px `line` hairline at the top once scrolled; while content remains below, a sticky `hit-floor` edge row on `surface` with a chevron and "More below" in `caption` `ink-muted`, under a `line` top border.
- **Props:** `label` (required), `axis?: 'y' | 'x'` (default `'y'`), `width?: 'full' | 'content'` (default `'full'`), `children`.
- **Axis `x`:** scrolls sideways (`overflow-x: scroll`, `overflow-y: hidden`) for the Board's row of columns. The same always-drawn bar sits along the bottom: a `scrollbar-size` high track (kept even when nothing scrolls, so the gutter never jumps), a `line-strong` thumb at least `hit-floor` long, a clear track. No "More below" row, no "More to the right" edge, no hairline, and it is never a tab stop (the content roves). It keeps `role="region"` with the host's name (Board uses "Board columns"). `width` does not apply.
- **Width:** with `width="content"` the children sit in one centred `content-width` column (`scroll-region-column`); the region stays full width so the scrollbar is at the window's edge. Reading pages pass it to `PageFrame` too; Board does not.
- **Keyboard:** `scroll-padding-block` (including the edge row's height) keeps focused items in view. The region is focusable only when it holds no focusable item.
- **VoiceOver:** a `section` landmark named by `aria-label`; the edge row is `aria-hidden`.
- The thumb is not a required target (the keyboard scrolls the region), so its floor is `hit-floor`, not `hit-min`.

Do: put every control a regular page has inside it in compact. Don't: nest scroll regions or let the page scroll.
