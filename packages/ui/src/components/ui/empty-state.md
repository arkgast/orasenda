An empty Inbox, Today or Review: a heading, one kind sentence and one quiet action and at most one ghost action.

- `title` defaults to "Nothing here yet"; `message` defaults to "That's fine. Start when you're ready."
- `actionLabel` with `onAction` adds a quiet button. Leave it out when there is no useful next step.
- `secondaryAction` (`{ label, onAction }`) adds one `ghost` button after the quiet action, for a second way on (the empty Board's "Import tasks…", or "Choose another source" after an empty import). It can stand alone. Never add a third.
- `variant="inline"` sits inside a `SettingsRow`: no padding, no heading, one `body-sm` `ink-muted` line and no action ("Nothing is recorded yet. Choosing which apps count as focus or distraction comes in a later update.").

Do: keep the copy short and in second person. Don't: add an illustration or comment on past performance.
