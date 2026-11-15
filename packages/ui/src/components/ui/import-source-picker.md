The import sheet's first step: where the tasks come from.

- **Props:** `sources` (`{ kind, name, description, disabledReason? }[]`), `reading?` (the `kind` being read) and `onPick(kind)`. Slots: `import-source-picker`, `import-source`.
- **Anatomy:** one bordered row per source, at least `hit-min` tall: the name in `body` (semibold), the description in `body-sm` `ink-muted`. A source that cannot be used now keeps its row, with a dashed border, and shows its reason in words under the description.
- **Keyboard:** the list is one tab stop. Up and Down move between rows, Home and End jump, Enter or Space picks. The row that was last focused is the stop.
- **VoiceOver:** each row is a button named by its source name; the description and the reason are its description (`aria-describedby`). A disabled row is `aria-disabled`, not `disabled`, so it stays reachable and its reason is read.
- **Reading:** the row named by `reading` shows "Reading…" in place of its description and is `aria-busy`; while a source is being read, no other row picks.

Do: say why a source is unavailable and when it will be ("Available between sessions, so nothing interrupts your focus."). Don't: hide an unavailable source or show it by colour alone.
