One message at the bottom centre of the window, built on `InlineNotice`.

- Same props as `InlineNotice` plus `onDismiss`, which adds a visible Dismiss button.
- The component sets no expiry. If the host auto-dismisses, wait at least eight seconds and pause while hovered or focused; never auto-dismiss anything with an action.

Do: replace the current toast rather than stack a second. Don't: play a sound for routine saves.
