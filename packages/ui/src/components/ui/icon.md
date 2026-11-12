A line icon from the closed `IconName` set, drawn from one inline table (no dependency). Lucide's geometry (ISC licence, © Lucide Contributors; parts © Cole Bemis, MIT, Feather) redrawn on a 20-unit grid.

- **Props:** `name` (required), `size?: 'md' | 'lg'`, default `lg`.
- **Names (20):** play, pause, stop, expand, collapse, window, menu, chevron, close, back, alert, info, pages, jump, and the rail set today, board, calendar, routines, review, settings. `chevron` points down; rotate it in CSS. The alert triangle stays reserved for the Warning mode: `alert` is a circle.
- **Anatomy:** an `svg` with viewBox 0 0 20 20, `fill: none`, stroke `currentColor` at 1.5, round caps and joins, `flex-none`. `lg` is 20px (`icon-lg`); `md` is 14px (`icon-md`), used for the field and notice alert glyphs and the Today preset chevron. At `md` the stroke is set to 15/7 units so it shows at 1.5px on screen (14px scaled from 20 units).
- **Colour:** it takes the text colour around it (`ink`, `ink-muted`, or `focus` on the current rail item). It never carries meaning alone: a word, label or shape always sits beside it.
- **VoiceOver:** always `aria-hidden="true"` and `focusable="false"`; the control that holds it carries the name.
- **Not here:** the mode shapes (`ModeShape`, internal) are state shapes, not icons.

Do: pair an icon with a label or a tooltip. Don't: draw a new glyph inline in app code, or recolour an icon to show state.
