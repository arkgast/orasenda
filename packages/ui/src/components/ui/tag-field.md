A row of tag chips and a field to add more.

- **Anatomy:** a visible `label`, the chips (a list; each is a `radius-pill` chip with the tag and a remove button), then a text field with the placeholder "Add a tag". Chips wrap to more rows.
- **Props:** `label`, `tags` (`string[]`), `onChange(tags)`, `max?` (default 8), `maxLength?` (default 24), `disabled`, `className`. Slots: `tag-field`, `tag-list`, `tag`, `tag-input`, `field-error`.
- **Adding:** Enter or a comma adds the trimmed text as a chip; a pasted "a, b, c" adds a and b and leaves c in the field. Leaving the field with text in it adds that too, so typing is never lost.
- **Refusals** show one line under the field and keep the typed text: a duplicate, compared without case ("writing is already a tag."); past `max` ("A task holds up to 8 tags."); past `maxLength` ("A tag is up to 24 characters."). The line is linked to the field by `aria-describedby` (a field error, not a live region), with the alert glyph, never red.
- **Remove:** each chip's button is named "Remove tag <t>". Its mark is `icon-md`, but the hit area grows to `hit-min` (44 × 44) around it, centred on the mark; the chips sit `space-2` apart across and `space-5` between wrapped rows, so neighbouring areas never overlap.
- **Focus:** the field and each remove button show the 2px `focus-ring` at a 2px offset.

Do: keep tags short nouns. Don't: use tags to carry state; use the column or the priority.
