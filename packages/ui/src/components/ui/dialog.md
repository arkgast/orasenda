A confirmation. Escape always does the safe thing.

- `title` names the consequence ("Delete all tracking data?"). `description` is the body. `children` can add content.
- `confirmLabel` and `onConfirm`; `cancelLabel` (default "Cancel") and `onCancel`. Escape calls `onCancel`, and the cancel button takes initial focus.
- `destructive` styles the confirm as `critical` and adds the `scrim`; `scrim` alone is for a dialog that needs the backdrop without the destructive confirm. Other confirmations keep a clear backdrop. `loading` keeps the dialog open while the host works.
- `emphasis="safe"`: the cancel action is the primary and the initial focus, and Esc or Return choose it; the confirm is quiet. Used only for "End the session and the lock?" during Strong lock ("Keep going" / "End session"). For Gentle and Firm, End never asks.
- Radix Dialog (`role="dialog"`), or AlertDialog (`role="alertdialog"`) when `destructive`: background inert, focus contained, focus restored to whatever had it when the dialog opened (the trigger). Backdrop clicks never dismiss. Esc closes only the topmost layer (`src/lib/layer.ts`).
- Sizes: the panel is capped at `panel-width` and shrinks to the window with a `space-3` gutter; padding and gaps are token steps.
- `size="sheet"` is the task sheet: capped at `sheet-width` (720px), always over the `scrim`, and `children` sit in a two-column field grid that stacks to one column when the sheet body is narrower than `container-sheet-stack` (600px). A field that needs the full width spans both columns (`@sheet-stack:col-span-2`). Edits in a sheet save on change, so its confirm reads "Done" and its cancel "Close"; Esc closes it and focus returns to the opener. In a sheet the title and the actions row stay pinned and only the field body scrolls when the window is short, so Done is always visible; the body keeps `space-3` of scroll padding so a focused field stays clear of the edge. A panel scrolls as a whole.
- `initialFocusRef` (optional) names the element that takes focus when the dialog opens instead of the cancel action. The task sheet passes its title field, because editing is its purpose; Esc and Close still return focus to the opener.

Do: mount one dialog at a time and keep the trigger mounted. Don't: perform the deletion in the component; the host does, after `onConfirm`.
