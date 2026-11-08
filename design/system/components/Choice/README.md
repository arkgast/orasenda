Labelled radio and checkbox chips in a `fieldset`, at least `hit-min` tall.

- Markup: `<fieldset class="os-choice-group"><legend>…</legend><label class="os-choice"><input type="radio|checkbox"> Label</label>…</fieldset>`. Use native inputs; the whole label is the target.
- The shape says what kind of choice it is: a radio is a circle with a filled `focus` dot (pick one); a checkbox is a square with an `on-focus` tick on a `focus` fill (pick any). A checked chip also takes the `selection` ground, so state never rests on colour alone.
- Disabled chips keep readable text and a dashed border.

Do: use radios for exclusive choices and checkboxes for independent ones. Don't: restyle a checkbox as a dot or a radio as a square.
