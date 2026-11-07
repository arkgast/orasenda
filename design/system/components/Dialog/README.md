A confirmation. Escape always does the safe thing.

- `title` names the consequence ("Delete all tracking data?"). `description` is the body. `children` can add content.
- `confirmLabel` and `onConfirm`; `cancelLabel` (default "Cancel") and `onCancel`. Escape calls `onCancel`, and the cancel button takes initial focus.
- `destructive` styles the confirm as `critical` and adds the `scrim`; `scrim` alone is for the full-screen exit. Other confirmations keep a clear backdrop. `loading` keeps the dialog open while the host works.
- Native modal via `showModal()`: background inert, focus contained, focus restored to the trigger on close. Backdrop clicks never dismiss.

Do: mount one dialog at a time and keep the trigger mounted. Don't: perform the deletion in the component; the host does, after `onConfirm`.
