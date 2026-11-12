The hotkey capture pad: write the thought down, tag it, go back to focus. Escape saves; it never discards.

- Controlled: `value` / `onChange` and `kind` / `onKindChange` (`internal` or `external` interruption, a native radio group with 44px labels).
- `onSave({ text, kind })` may return a Promise. The pad closes only after it resolves; on rejection the text stays and a line says "Your note is still here. Try saving again." Duplicate saves are suppressed while busy.
- Copy: description "Leave it here and go back to what you were doing."; helper "Esc saves to Inbox and closes. ⌘↩ saves too." A line beside Save explains the chosen kind ("This came from your own mind." or "This came from around you."). In the source the return arrow is written as the escape `\u21a9`, because the copy guard rejects the arrow as an emoji. Control-Return also saves, as the Windows equivalent (ADR-001).
- Success closes the pad. The pad closes, so it cannot announce from a closed dialog: **the host announces "Saved to Inbox." once** (a status message in the window it returns to); no toast. The pad adds no live region of its own; its error line is not live either.
- `onClose` is called after a save or when Escape is pressed on an empty pad. Save is disabled for whitespace-only text.

Do: open it from the capture hotkey only when no other modal is open. Don't: send the note anywhere; it lands in the local Inbox.
