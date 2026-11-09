One setting: its label, its control, an always-visible helper and one line for its own status.

- **Anatomy:** a label or legend; the control (`Input`, `Choice`, `Select` or `ShortcutRecorder`); an always-visible helper; one status line with an optional ghost or quiet action; a `line` hairline between rows. Minute fields use `field-width` and `number-width`; `Choice` groups start-align.
- **States:** saved (rest); invalid (the `Input` error beside the field: alert glyph and "Between 5 and 180 minutes. Still using 45."); not saved (the reason beside the field, "Orasenda can't write its data file.", and Try again); disabled (a visible line says why).
- **Saving:** Settings save on change with no Save button; text and number fields save on blur or Return; Esc restores the saved value. The page's status row is the save line (see `InlineNotice`, Settings slots).
- An empty section uses `EmptyState` `variant="inline"` inside the row.

Do: say a problem beside the field that caused it. Don't: move or hide the control while a save is pending.
