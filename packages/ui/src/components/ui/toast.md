One message at the bottom centre of the window, built on `InlineNotice`.

- Same props as `InlineNotice` plus `onDismiss`, which adds a visible Dismiss button.
- The component sets no expiry. If the host auto-dismisses, wait at least eight seconds and pause while hovered or focused; never auto-dismiss anything with an action.

Do: replace the current toast rather than stack a second. Don't: play a sound for routine saves.

- **Placement:** by default the toast is fixed at the bottom centre of the window. A host that runs a step flow (the daily shutdown) places it in the flow instead, under the step's scroll region and above the footer: it takes its own room, the region shrinks to make way, and it never covers a line or a field. Below `layout-short-height` it lays out as one wrapping row to save height.
