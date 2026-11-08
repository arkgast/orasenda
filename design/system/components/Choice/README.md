Labelled radio and checkbox chips in a `fieldset`, at least `hit-min` tall.

- Markup: `<fieldset class="os-choice-group"><legend>…</legend><label class="os-choice"><input type="radio|checkbox"> Label</label>…</fieldset>`. Use native inputs; the whole label is the target.
- The shape says what kind of choice it is: a radio is a circle with a filled `focus` dot (pick one); a checkbox is a square with an `on-focus` tick on a `focus` fill (pick any). A checked chip also takes the `selection` ground, so state never rests on colour alone.
- Disabled chips keep readable text and a dashed border.
- The input takes the system `focus-ring` outline (2px, 2px offset) on keyboard focus; it is never clipped by the chip.
- A checkbox inside a chip is 14px (`icon-md`) with half of `radius-sm`, so it reads as a square rather than a dot.
- In forced-colors mode (Windows high contrast) the checked dot and the checkbox fill use the system `Highlight` colour, with a `Canvas` ring around the dot and a `HighlightText` tick, so a checked chip never looks unchecked. A disabled checked chip uses `GrayText` instead, and the focus ring on a checked input uses `Highlight`, so both follow the user's contrast theme.

Do: use radios for exclusive choices and checkboxes for independent ones. Don't: restyle a checkbox as a dot or a radio as a square.
