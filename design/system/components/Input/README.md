A labelled single-line field.

- `label` is always visible; `helper` and `error` are linked through `aria-describedby`. Native input props pass through; `id` is generated when not supplied. Input has no `labelHidden`: the only control with a hidden label is the compact page picker `Select`.
- `unit` adds a suffix ("min") after a number field sized to `number-width`.
- `error` keeps the typed value, sets `aria-invalid`, thickens the border and shows the alert glyph (an outlined circle with a bar and a dot, not the triangle) with words that name the value still in use ("Between 5 and 180 minutes. Still using 45."). No colour change, no red.
- Ground `surface-sunken`, border `line-strong`, `focus-ring` on focus, `focus` border on hover. Disabled keeps `ink-muted` text at full opacity and a dashed border.

Do: keep validation local and the wording plain. Don't: use a placeholder as the label.
