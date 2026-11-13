A read-only table of every shortcut in the app: the action, then its keys.

- **Anatomy:** a semantic `table` with a hidden caption "All shortcuts" and hidden column headers (Action, Keys). The action is the row header (`ink`, `body`); the keys sit at the end of the row as one `Kbd` per key, then the word "Off" in `ink-muted` when the shortcut is not live. Rows are separated by a `line` rule. The table fills its container and is never wider than `panel-width`.
- **Props:** `items`, each `{ action, keys, spokenKeys, off? }`. `keys` is canonical glyph strings separated by a space, one `Kbd` each ("⌘K", "Space F P"). `spokenKeys` is all of them in words ("Command-K", "Space, F, P"); the host fills it from `describeShortcut(keys).spoken`.
- **States:** live; off (`off: true`: the keys stay, the word "Off" follows them, so the state is never colour alone).
- **VoiceOver:** each `Kbd` glyph is `aria-hidden`; one visually hidden span per row reads `spokenKeys` ("Command-K"), with ", Off" added when off. No live region, no focus stop: the table is not interactive.
- **Host provides:** the section heading and the list of items, with `off` true while single-key shortcuts are off. The component never reads a setting.

Do: list every shortcut, even the off ones. Don't: put a control in a row.
