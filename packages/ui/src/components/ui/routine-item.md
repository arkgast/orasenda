One habit inside a routine. The whole row is the checkbox.

- `label`, `detail` (the anchor or two-minute version), `optional` for practices marked optional or experimental.
- `done` with `onChange` is controlled; the host owns completion. Without `onChange`, `defaultDone` gives previews local state.
- `readOnly`: the list form for overviews: a rounded square, the label and the detail; no checkbox and no tab stop (a plain `div`, `data-read-only`, `data-state` of `done`, `skipped` or `open`). It fills its container (`max-w-full`); the checkbox form keeps `max-w-panel-width`. The host puts the rows in a list. Checkboxes appear in a running routine and as a habit's "Done today".
- `readOnly` with `done`: a filled `break` box with the `on-break` tick, an `ink-muted` label and a hidden "Done today: " before the label for VoiceOver.
- `readOnly` with `skipped`: an outlined box with a short dash and the visible word "Skipped" after the label. `done` wins if both are set. In every read-only case the label, detail and "Optional" stay exposed.
- `name` sets the spoken name when the visible label repeats across rows: a habit's "Done today" box is named "Done today: Stretch".
- The row is a native button with `role="checkbox"`, `aria-checked`, at least 44px tall. A done item keeps a filled `break` check and readable `ink-muted` text; nothing is struck through.
- Two changes from the legacy button, both from the Radix checkbox: the check box border is 2px (was 1.5px, which the closed theme cannot express), and Enter no longer toggles; Space does, as the ARIA checkbox pattern says.

Do: put a `WellnessNote` at the foot of any routine with wellness content. Don't: use local state as app storage.
