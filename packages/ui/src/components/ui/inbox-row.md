One captured note in the Inbox list.

- **Anatomy:** a list item (`li`) with the note text in `ink` (`body`), then a meta line in `ink-muted` (`body-sm`): the kind as a word, "Internal" or "External", a "·" and the time. A 44 × 44 (`hit-min`) `IconButton` with the `close` icon sits at the end. A `line` rule closes the row.
- **Props:** `text`, `kind` (`"internal" | "external"`), `time` (as shown, "09:41"), `timeLabel` (the time in words for VoiceOver, "Captured at 9:41 AM"), `onRemove()`, `removeName` (the Remove button's name).
- **Text:** it wraps at spaces and breaks a long word, and keeps its line breaks. It is never truncated or clamped, so a 1000-character note shows in full and the row grows.
- **States:** rest; the Remove button has the `IconButton` hover, pressed and focus states (2px `focus-ring`, 2px offset). The kind is always a word, never colour alone.
- **VoiceOver:** the visible time is `aria-hidden` and `timeLabel` is read instead. The button's name is `removeName` exactly ("Remove note: Ask Sam about the invoice"); the tooltip is `IconButton`'s own. No live region.
- **Host provides:** the surrounding `ul` and the row's width (the row has no cap of its own; it keeps `space-1` free at the end so the Remove focus ring is not clipped), the first-40-characters `removeName`, the formatted `time` and `timeLabel`, and the "Note removed." status line with Undo after `onRemove`.

Do: give each Remove a name that says which note. Don't: shorten the note text.
