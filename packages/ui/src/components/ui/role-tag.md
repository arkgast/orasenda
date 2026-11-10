An app's role or privacy setting in words, with a glyph.

- **Anatomy:** a `span`; a 14px (`icon-md`) line glyph at 1.5 stroke plus the word, in `ink-muted` (the Focus role uses `focus`).
- **Glyphs:** Distracting = diamond outline; Always allowed = shield outline; Focus = filled circle; Neutral = an outlined circle with a short horizontal bar across its centre (distinct from the alert glyph, whose bar is vertical with a dot below); Never record = closed eye; Site = globe.
- **Mode shapes:** the Focus role's filled circle is the only reuse of a mode shape, on purpose, because it means the Focus mode. Neutral never uses the hollow circle, which means shallow, paused or idle.
- **Contrast:** `ink-muted` on `surface-raised` 5.91 / 6.75; `focus` on `surface-raised` 5.85 / 7.85.

Do: always show the word. Don't: use `amber` or `critical`, drop the word, or reuse a mode shape for anything but its mode.
