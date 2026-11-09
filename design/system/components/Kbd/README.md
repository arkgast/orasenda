A key name inline in a tip, a tooltip or a caption.

- **Anatomy:** the `kbd` type style (mono 12/16), `ink` text on `surface-raised`, a 1px `line-strong` edge, `radius-sm`, padding `0 space-1`.
- **Props:** `keys` (the glyph string, "⌃⌥F") and `spoken` (required in running text: "Control-Option-F", "Command-Return", "F key").
- **States:** none; it is never a control.
- **VoiceOver:** the glyph is `aria-hidden`. In running text a visually hidden sibling carries `spoken`; in a tooltip the trigger's `aria-keyshortcuts` speaks it.
- **Single keys:** a `Kbd` for Space, F or P appears only while the Single-key shortcuts setting is on.
- Replaces the ad hoc `sp-kbd`, `ob-kbd` and `hz-tip kbd` styles.

Do: always pass a spoken name in text. Don't: style a Kbd as a button or make it focusable.
