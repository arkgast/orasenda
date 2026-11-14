A whole number with − and + buttons, for a count such as an estimate in sessions.

- **Anatomy:** a visible `label`, then a − button, the value box and a + button in one row. The box is a `surface-sunken` field like `Input`; the buttons are `IconButton`s at `hit-min`.
- **Props:** `label`, `value`, `min`, `max`, `onChange(n)`, `zeroLabel?` (shown instead of the number at 0, such as "No estimate"), `valueText?` (`(n) => string`, the words for a value, such as "3 sessions"; defaults to the number), `disabled`, `className`. Slots: `stepper`, `stepper-value`.
- **Keyboard:** the value box is the one tab stop (`role="spinbutton"`): ArrowUp and ArrowDown step by 1, Home and End jump to `min` and `max`. The two buttons are for the pointer and VoiceOver and stay out of the tab order. Values clamp to `min` and `max`; `onChange` is not called when nothing changes.
- **Bounds:** at a bound its button is disabled (dashed border, muted glyph), and says so to VoiceOver.
- **VoiceOver:** the box is a spinbutton named by the label, with `aria-valuenow`, `aria-valuemin`, `aria-valuemax` and `aria-valuetext` (the zero label at 0, else `valueText`). The buttons are "Decrease <label>" and "Increase <label>".
- **Focus:** the 2px `focus-ring` at a 2px offset on the box and on each button.

Do: pass `zeroLabel` when 0 means none. Don't: use it for ranges past a few dozen; use an `Input` with a unit.
