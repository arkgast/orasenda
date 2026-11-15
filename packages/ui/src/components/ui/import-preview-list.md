The import sheet's preview: pick which tasks to bring in.

- **Props:** `label` (names the group), `items` (`{ key, title, meta?, why?, checked }[]`), `onToggle(key)`, `onSetAll(checked)` and `summary?` (plain lines such as "Showing 500 of 812 tasks."). Slot: `import-preview-list`.
- **Anatomy:** a count line ("12 of 14 selected", `body-sm`, not a live region) with a quiet *Select all* or *Select none* (whichever applies) beside it, the `summary` lines in `ink-muted`, then one `Choice long` checkbox row per item, `space-2` apart. The title is the chip's title; `meta` is an `ink-muted` line and `why` an `ink` line under it, so a row that needs a look ("Already on the Board, in Today") reads stronger in words, not colour.
- **Keyboard:** the rows sit in a `role="group"` named by `label` and are one tab stop, because a preview can hold 500 rows. Up and Down move, Home and End jump, Space toggles the focused row. *Select all* is its own tab stop before the group.
- **VoiceOver:** each checkbox is named by its title and described by its meta and why lines.
- **Layout:** rows are never virtualised and have fixed content, so 500 rows render without a layout shift. In a sheet, wrap it in `@sheet-stack:col-span-2` so it spans both columns. Put the component inside a scroll container (the `Dialog size="sheet"` body, which scrolls while the title and actions stay pinned).

Do: show the reason a task is flagged in words. Don't: announce the count on every toggle.
