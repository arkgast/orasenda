One setting: its label, its control, an always-visible helper and one line for its own status.

- **Anatomy:** a label or legend; the control (`Input`, `Choice`, `Select` or `ShortcutRecorder`); an always-visible helper; one status line with an optional ghost or quiet action; a `line` hairline between rows. Minute fields use `field-width` and `number-width`; `Choice` groups start-align.
- **States:** saved (rest); invalid (the `Input` error beside the field: alert glyph and "Between 5 and 180 minutes. Still using 45."); not saved (the reason beside the field, "Orasenda can't write its data file.", and Try again); disabled (a visible line says why).
- **Saving:** Settings save on change with no Save button; text and number fields save on blur or Return; Esc restores the saved value. The page's status row is the save line (see `InlineNotice`, Settings slots).
- An empty section uses `EmptyState` `variant="inline"` inside the row.

## Notifications row

The Notifications row, by status and preference (index value in brackets). The *Ask macOS* and *Open System Settings* actions are quiet `Button`s. The denied lines are plain `ink` text with no glyph, never amber or critical.

| Status | Preference | Box | Line | Action |
|---|---|---|---|---|
| `notDetermined` | off | off | "Turning this on asks macOS for permission, once." [Off] | none |
| `notDetermined` | on (synced or after `tccutil reset`) | on | "On here, but macOS hasn't been asked yet." [Not asked yet] | quiet *Ask macOS* → `notifications_request` |
| (asking) | — | on, `aria-busy` | "Waiting for your answer in the macOS prompt." [Asking macOS] | none |
| `granted` | on | on | "On. A notification appears when a session ends while Orasenda is in the background." [On] | none |
| `granted` | off | off | none [Off] | none |
| `denied` | off | off | "macOS has notifications off for Orasenda." [Off in macOS] | quiet *Open System Settings* (name "Open System Settings, Notifications for Orasenda") |
| `denied` | on | on | "On here, but macOS has notifications off for Orasenda. Allow them in System Settings and Orasenda will use them." [Off in macOS] | *Open System Settings* |
| `unavailable` | either | shows the preference, disabled | "Notifications aren't available in this build." [Not available] | none |

## Props and accessibility

- `label`, `helper` (always visible), optional `status` (the row's own line), optional action: `actionLabel` and `onAction`, with `actionName` for an accessible name that differs from the visible text, and `actionVariant` (`'quiet'` by default, or `'ghost'`). `disabledReason` is a visible line saying why the control is disabled.
- `id` fixes the base of the generated ids (`<id>-label`, `<id>-help`, `<id>-status`, `<id>-why`) so a control inside the row can be `aria-describedby` its helper and status line.
- The row is `role="group"` named by its label and described (`aria-describedby`) by the helper, the status line and the disabled reason. The action sits beside the status line, outside it, so the description stays the words.

Do: say a problem beside the field that caused it. Don't: move or hide the control while a save is pending.
