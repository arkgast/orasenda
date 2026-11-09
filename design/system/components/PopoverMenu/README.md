The one in-webview menu, for a choice that needs radios and a heading: the preset on Today and in the Focus window, and an app's role on Apps and sites.

- **Anatomy:** a `popover-width` panel on `surface-overlay`, 1px `line-strong` edge, `radius-md`, `shadow-overlay`, `z-popover`; a heading (`body-sm` `ink`, weight 600), an optional second line (`body-sm` `ink-muted`), 44px rows, a separator and an optional link row.
- **Props:** `heading`, `description?`, `items: { id, label, meta?, kind: 'radio' | 'checkbox' | 'link', checked?, disabled? }`, `readOnly?`, `onSelect`, `onClose`.
- **States:** a checked radio shows the `Choice` radio shape (a circle with a filled `focus` dot) on `selection`; a checkbox row shows the `Choice` checkbox shape plus an Off/On word; hover `surface-sunken`; disabled rows have a dashed ring and `ink-muted` text.
- **Read-only (a session is running):** heading "Classic · 25 / 5", line "Presets can change between sessions.", the current radio checked, the others `aria-disabled`, the Settings row still live.
- **Focus window:** opens only while idle and has no Settings row ("Preset for the next session", "Choosing one applies it and closes.").
- **Keyboard:** opens with click, Return, or P on Today while single-key shortcuts are on. ↑/↓ move, Return or Space chooses and closes, Esc closes; focus returns to the trigger.
- **VoiceOver:** `role="menu"` labelled by the heading and described by the second line; rows are `menuitemradio`, `menuitemcheckbox` or `menuitem`. The dot is the non-colour cue; there is no "Current" word.

Do: use it only for a choice. Don't: use it for navigation or commands (those are native NSMenus), or stack two.
