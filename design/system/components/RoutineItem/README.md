One habit inside a routine. The whole row is the checkbox.

- `label`, `detail` (the anchor or two-minute version), `optional` for practices marked optional or experimental.
- `done` with `onChange` is controlled; the host owns completion. Without `onChange`, `defaultDone` gives previews local state.
- The row is a native button with `role="checkbox"`, `aria-checked`, at least 44px tall. A done item keeps a filled `break` check and readable `ink-muted` text; nothing is struck through.

Do: put a `WellnessNote` at the foot of any routine with wellness content. Don't: use local state as app storage.
