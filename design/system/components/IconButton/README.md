An action shown as an icon, always with a label in its `Tooltip` and its accessible name. Used for Pause/Resume, End, Focus view, Leave full screen, Pages, Jump to section, Close and Change role.

- **Anatomy:** a native `button` with one 20px (`icon-lg`) line icon at 1.5 stroke, and an optional `Tooltip`.
- **Props:** `label` (required: the accessible name and the tooltip text), `icon`, `shortcut?` (shown as a `Kbd` in the tooltip and set as `aria-keyshortcuts`), `size: 'md' | 'round'`, `onClick`, `disabled`, and `aria-haspopup` when it opens a menu, native or `PopoverMenu`.
- **Sizes:** `md` is 44 × 44 (`hit-min`). `round` is 52 × 52 (`control-lg`) on a `surface-raised` ground with a `line-strong` edge; it is Pause/Resume on Today and in the Focus window, so the target is visible and not only the glyph. Inside `SessionSlot` and `FloatingTimer` the button is `md`.
- **States:** rest (icon `ink`, clear ground; round: `surface-raised`); hover `surface-sunken`; pressed `selection`; disabled: dashed `line-strong`, icon `ink-muted`, with a visible line elsewhere that says why; keyboard focus: the 2px `focus-ring` at a 2px offset.
- **Keyboard:** Tab, Space, Return. Never more than one tab stop.
- **VoiceOver:** the name is `label` exactly ("Pause session"); the shortcut is spoken through `aria-keyshortcuts`. No `title` attribute.

Do: give every IconButton a label someone would say. Don't: show an icon alone without a tooltip, or give anything with visible text an `aria-label` that drops it.
