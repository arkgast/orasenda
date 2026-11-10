The hotkey capture pad: write the thought down, tag it, go back to focus. Escape saves; it never discards.

- Controlled: `value` / `onChange` and `kind` / `onKindChange` (`internal` or `external` interruption, a native radio group with 44px labels).
- `onSave({ text, kind })` may return a Promise. The pad closes only after it resolves; on rejection the text stays and a line says "Your note is still here. Try saving again." Duplicate saves are suppressed while busy.
- Copy: description "Leave it here and go back to what you were doing."; helper "Esc saves to Inbox and closes. ⌘↩ saves too." A line beside Save explains the chosen kind.
- Success closes the pad and announces "Saved to Inbox." once; no toast.
- `onClose` is called after a save or when Escape is pressed on an empty pad. Save is disabled for whitespace-only text.

Do: open it from the capture hotkey only when no other modal is open. Don't: send the note anywhere; it lands in the local Inbox.
