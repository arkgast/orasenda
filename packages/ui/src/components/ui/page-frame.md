One frame for Board, Calendar, Routines, Review and Settings: a header, a reserved status row and a `ScrollRegion`.

- **List variant:** three rows, `space-2` apart. Header (`hit-min`): the title or the compact picker, and at its end the page's one primary, or the `SessionSlot` while a session runs, or a step word. Status row (44px, reserved; Settings' save line): `InlineNotice` `variant="row"`. Then the `ScrollRegion`. Padding `space-5 space-6 space-6` in regular windows, `space-4` in compact. At 360 × 240 the region is 240 − 44 − 44 − 32 − 16 = 104px.
- **Heading:** the title is the `h1`. When a compact picker replaces it, the `h1` is visually hidden. Either way it receives focus on arrival.
- **Flow variant:** adds a fixed `control-lg` footer (rows still `space-2` apart): End (Esc) on the left, an optional "Not now" ghost on optional steps, the primary Continue on the right. The header's end shows "Step 2 of 4" or "All 4 steps done" in `body-sm` `ink-muted`. Below `layout-short-height` the status row takes no space while empty. At the minimum window a flow's region is at least 44px while a status line shows (240 − 44 − 44 − 52 − 32 − 24); if the layout test shows a step unusable there, the flow variant takes a minimum window height of 280. Used by shutdown, the weekly review and a running routine.
- **Props:** `title`, `primary?`, `status` (status-row content), `variant: 'list' | 'flow'`, `step?`, `footer?`, `compactPicker?`.
- **Keyboard:** tab order header → status action → region → footer.

Do: put one primary at the header's end. Don't: let the page scroll, or give the header a second row.
