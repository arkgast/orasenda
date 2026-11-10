One app or site in Apps and sites and in Privacy.

- **Anatomy:** the real app icon at `icon-lg` with `radius-sm` (a globe for a site); the name and an optional quiet second line ("Not installed now. The rule stays.", "Needs the browser extension", "Browser fallback until the extension is installed"); a read-only `RoleTag`; exactly one interactive element: an `IconButton` "Change role for <app>" that opens the role `PopoverMenu` (`aria-haspopup="menu"`), or on Privacy "Record again". Height `control-lg` in regular windows, `hit-min` in compact. Below 360px of row width the `RoleTag` wraps under the name.
- **No letter key:** the button is one Tab from the focused row in the roving list, and Settings has no single-key shortcuts.
- **States:** built-in rows say "Built in" as a word-only tag (no glyph: it is not a role) and have no interactive element; a failed save adds a line under the row (alert glyph and words, `role="status"`).
- **Keyboard:** each list is one tab stop; ↑/↓ move; the row itself is never a button.
- **VoiceOver:** the list item reads as "Stocks, Not recorded".
- The preview draws a neutral square where the real app icon goes; the app renders the icon macOS provides.

Do: show the real icon. Don't: make tags links or tab stops.
