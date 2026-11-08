The Gentle overlay: "Is this what you intended?" with a breathing circle and three honest choices.

- `app`: the name shown in the copy. `title`, `message` and `waitLabel` override the defaults.
- `onReturn` is the primary "Back to focus"; Escape and initial focus go here. `onWait` is the ghost "Wait 10 minutes, then decide"; the host owns the wait. Like `onContinue`, the Wait button is rendered only when `onWait` is passed: leave it out when the host cannot run a wait yet. `onContinue(reason?)` reveals an optional reason group ("Work", "Quick check", "Other") and a Continue action; the reason is optional in Gentle mode, stays local and can be deleted.
- Native modal: background inert, focus contained, `scrim` backdrop, focus returns to the still-mounted trigger. Unmount or set `open: false` when done.

Do: keep "Back to focus" the only primary. Don't: show bypass counts here, or omit `onContinue` unless the user chose a stricter mode.
