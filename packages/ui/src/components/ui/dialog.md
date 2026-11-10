A confirmation. Escape always does the safe thing.

- `title` names the consequence ("Delete all tracking data?"). `description` is the body. `children` can add content.
- `confirmLabel` and `onConfirm`; `cancelLabel` (default "Cancel") and `onCancel`. Escape calls `onCancel`, and the cancel button takes initial focus.
- `destructive` styles the confirm as `critical` and adds the `scrim`; `scrim` alone is for the full-screen exit. Other confirmations keep a clear backdrop. `loading` keeps the dialog open while the host works.
- `emphasis="safe"`: the cancel action is the primary and the initial focus, and Esc or Return choose it; the confirm is quiet. Used only for "End the session and the lock?" during Strong lock ("Keep going" / "End session"). For Gentle and Firm, End never asks.
- Radix Dialog (`role="dialog"`), or AlertDialog (`role="alertdialog"`) when `destructive`: background inert, focus contained, focus restored to whatever had it when the dialog opened (the trigger). Backdrop clicks never dismiss. Esc closes only the topmost layer (`src/lib/layer.ts`).
- Sizes: the panel is capped at `panel-width` and shrinks to the window with a `space-3` gutter; padding and gaps are token steps.

Do: mount one dialog at a time and keep the trigger mounted. Don't: perform the deletion in the component; the host does, after `onConfirm`.
