The ⌘K palette: a search field over a list of commands.

- `commands`: `{ id, label, hint? }`. `onSelect(id)` runs before `onClose`. Mount a fresh instance per invocation so the query starts empty.
- The field is a combobox with `aria-activedescendant`; Arrow Up and Down wrap through the results, Enter runs the highlighted command, Tab reaches Close, Escape closes. Keys pressed while an input method is composing are ignored.
- Native modal on `surface-overlay` with a clear backdrop.

Do: open it only when no other modal is open. Don't: list commands that are unavailable right now.
