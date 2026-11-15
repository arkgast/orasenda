A native `select` in the `Input` family, for values, the compact page pickers (Column, Day, Routine, Period) and the AppPicker's "Add as".

- **Anatomy:** a visible label; a `surface-sunken` field like `Input` with a 1px `line-strong` border, `radius-md`, `body` at weight 400, `hit-min` tall, and a drawn 14px chevron in `ink-muted` (4.82 light / 7.94 dark on `surface-sunken`).
- **Compact page picker:** the one exception to the visible label. When a picker replaces a page title, its label is visually hidden (`labelHidden`) and its value is set at weight 600, because the value is the title. The other: a select inside a `SettingsRow`, whose own label already names it (the row's visible label stands in; `labelHidden` keeps it from showing twice, and the select's `aria-describedby` points at the row's helper).
- **Props:** `label`, `labelHidden?` (only for a compact page picker or a select inside a SettingsRow), `options` (`{ value, label, disabled? }[]`), `helper?` (a line under the field, linked with `aria-describedby`; a disabled select uses it to say why), `className`, and the native select props (`value`/`onChange` or `defaultValue`). Slots: `field`, `field-label`, `select`, `select-chevron`, `field-helper`.
- **States:** hover `focus` border; keyboard focus ring; disabled: dashed border with a line that says why.
- **Keyboard and VoiceOver:** native. A Day picker lists "Today" as an extra first option only when the week shown does not contain today; otherwise the day itself reads "Mon 9 Nov, today".

Do: keep the label visible. Don't: list two options for one value.
