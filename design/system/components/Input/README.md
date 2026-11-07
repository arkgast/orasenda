A labelled single-line field.

- `label` is always visible; `helper` and `error` are linked through `aria-describedby`. Native input props pass through; `id` is generated when not supplied.
- `error` sets `aria-invalid`, thickens the border and shows a triangle glyph with plain text. No colour change, no red.
- Ground `surface-sunken`, border `line-strong`, `focus-ring` on focus, `focus` border on hover. Disabled keeps `ink-muted` text at full opacity and a dashed border.

Do: keep validation local and the wording plain. Don't: use a placeholder as the label.
