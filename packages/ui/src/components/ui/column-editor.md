The editor that replaces a Board column's header: its name, its limit, and the two column actions, in one place.

- **Anatomy:** a `Name` `Input`, a `Limit` `Stepper` (only when `limit` isn't null), *Save* (`primary`) and *Cancel* (`quiet`), then *Add column after* and, when the column can be removed, *Remove column* (both `quiet`). Root slot: `column-editor`, a `role="group"` named "Edit column".
- **Props:** `name`, `limit` (`{ value, min, max, zeroLabel? } | null`), `error?`, `taken` (the other columns' names), `canAdd` (`true | { reason }`), `canRemove` (`true | { reason } | null`), `onSave({ name, limit })`, `onCancel()`, `onAdd()`, `onRemove()`.
- **On mount:** the name field takes focus with its text selected.
- **Keys:** Return in the name or the stepper saves (the name trimmed); Esc cancels. Focus leaving the editor saves a valid edit and cancels an invalid one. Moving between the editor's own controls does nothing. A press on a button keeps focus where it is, so a click on Save or Cancel never saves twice.
- **Name checks, as the person types:** 1 to 24 characters after trimming ("Use 1 to 24 characters.") and not the same as another column in `taken`, ignoring case ("Another column has that name."). Either shows inline under the field, as `Input` does, and blocks Save. A given `error` (the service's refusal) shows the same way until the name changes; it does not block Save.
- **Limit:** the stepper starts at `limit.value`. At 0 with `zeroLabel` it reads that word ("No limit") and the save carries `limit: null`. Without a `zeroLabel`, 0 saves as 0.
- **Dimmed actions:** when `canAdd` or `canRemove` is `{ reason }`, the button is `aria-disabled` (not `disabled`), stays focusable, never calls its handler, and points to its reason with `aria-describedby`. The reason sits under it in `caption` `ink-muted`. `canRemove: null` leaves Remove out.
- **Copy:** plain and kind; no exclamation marks. Remove is `quiet`, not `critical`: the host confirms with a toast, not with colour.
- **VoiceOver:** the group is "Edit column"; the field is "Name"; the spinbutton is "Limit" with its words.
- **Focus:** each control keeps its own 2px `focus-ring`.

Do: save a valid edit when focus leaves. Don't: use it for anything but a column; the host owns the writing and the closing.
