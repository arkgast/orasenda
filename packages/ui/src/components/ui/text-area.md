A labelled multi-line field with the same helper and error behaviour as `Input`.

- `rows` defaults to 4; vertical resize stays available.
- The control never shrinks below the minimum hit height, even with `rows=1` or after resizing.
- Pass `disabled` while a save is pending rather than dimming the field.

Do: keep the user's text after a failed save. Don't: clear it on validation.
