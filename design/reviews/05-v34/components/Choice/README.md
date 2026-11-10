Labelled radio and checkbox chips in a `fieldset`, at least `hit-min` tall.

- Markup: `<fieldset class="os-choice-group"><legend>…</legend><label class="os-choice"><input type="radio|checkbox"> Label</label>…</fieldset>`. Use native inputs; the whole label is the target.
- The shape says what kind of choice it is: a radio is a circle with a filled `focus` dot (pick one); a checkbox is a square with an `on-focus` tick on a `focus` fill (pick any). A checked chip also takes the `selection` ground, so state never rests on colour alone.
- Disabled chips keep readable text and a dashed border.
- Groups start-align by default; centring is Today's `.os-intent` modifier only.
- **`segmented` variant** (`.os-segmented`): joined radios, `hit-min` tall, a `line-strong` outer border and inner separators, the first and last carrying `radius-md` corners. Selected: `selection` ground, a 2px `focus` underline inside and bold text. Keyboard focus rings the focused segment's label (`label:has(input:focus-visible)`) at the standard 2px offset; arrow keys move. Use it to switch parallel lists inside a compact page, never as a page picker (that is `Select`).
- **`long` variant** (`.os-choice-long`): a full-width chip, top-aligned, a bold title plus one `body-sm` `ink-muted` sentence; for strength levels and recording checkboxes.
- The input takes the system `focus-ring` outline (2px, 2px offset) on keyboard focus; it is never clipped by the chip.
- A checkbox inside a chip is 14px (`icon-md`) with half of `radius-sm`, so it reads as a square rather than a dot.
- In forced-colors mode (Windows high contrast) the checked dot and the checkbox fill use the system `Highlight` colour, with a `Canvas` ring around the dot and a `HighlightText` tick, so a checked chip never looks unchecked. A disabled checked chip uses `GrayText` instead, and the focus ring on a checked input uses `Highlight`, so both follow the user's contrast theme.

Do: use radios for exclusive choices and checkboxes for independent ones. Don't: restyle a checkbox as a dot or a radio as a square.
