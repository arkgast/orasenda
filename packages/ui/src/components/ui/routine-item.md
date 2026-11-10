One habit inside a routine. The whole row is the checkbox.

- `label`, `detail` (the anchor or two-minute version), `optional` for practices marked optional or experimental.
- `done` with `onChange` is controlled; the host owns completion. Without `onChange`, `defaultDone` gives previews local state.
- `readOnly`: the list form for overviews: a hollow rounded square, the label and the detail; no checkbox and no tab stop. Checkboxes appear only in a running routine.
- The row is a native button with `role="checkbox"`, `aria-checked`, at least 44px tall. A done item keeps a filled `break` check and readable `ink-muted` text; nothing is struck through.
- Two changes from the legacy button, both from the Radix checkbox: the check box border is 2px (was 1.5px, which the closed theme cannot express), and Enter no longer toggles; Space does, as the ARIA checkbox pattern says.

Do: put a `WellnessNote` at the foot of any routine with wellness content. Don't: use local state as app storage.
