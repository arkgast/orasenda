A task's checklist: a checkbox per item, a live count and an add field. Edits go up as they happen; the host saves them.

- **Anatomy:** a `fieldset` named by its `label` (the legend); a count line ("2 of 5 done", `body-sm` `ink-muted`, `role="status"`, so the change is announced); one row per item with a checkbox, the item's text as an editable field, and a remove `IconButton`; then the add field ("Add an item"). The rows are a list.
- **Props:** `label`, `items` (`{ id, text, done }[]`), `onToggle(id)`, `onAdd(text)`, `onRemove(id)`, `onRename(id, text)`, `max?` (default 30), `disabled`, `className`. Slots: `checklist`, `checklist-count`, `checklist-items`, `checklist-item` (`data-done`), `field-error`.
- **Limits:** an item's text is 1 to 200 characters (`maxlength` 200 on both fields); at most `max` items. Past the limit Enter adds nothing and a line says why ("A checklist holds up to 30 items."), keeping the typed text. The line is a status message, never red.
- **Keyboard:** Enter in the add field adds the trimmed text and clears the field (an empty field does nothing). In an item's text, Enter saves the edit; a rename also saves when focus leaves. Emptying the text and leaving puts the old text back; Backspace in an already empty text removes the item and moves focus to the item above, or to the add field. Space toggles a checkbox.
- **State, by shape and words:** done is a filled `focus` checkbox with a tick (the same square as `Choice`), muted text and a strike-through, and counted in the line; never colour alone.
- **Hit targets:** each checkbox sits in a `hit-min` square, the text fields and the remove button are `hit-min` tall. Keyboard focus is the 2px `focus-ring` at a 2px offset.
- **VoiceOver:** the group is read with its label; each checkbox is named by its item text, each text field "Edit <text>", each remove button "Remove item <text>". The count is read when it changes.

Do: pass the whole list and let the host assign ids. Don't: use it for a list longer than 30 items; that is a project.
