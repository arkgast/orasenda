One routine on the Routines page: its name, time and days, today's state and its steps.

- `name` is the heading (`h2` by default, `headingLevel={3}` inside a section). The card is an `article` with `aria-labelledby` pointing at it.
- `meta` is the time and days in `body-sm` `ink-muted`: "07:00 · Every day".
- `today` is `notStarted`, `inProgress` or `finished`, drawn as a shape plus words: a hollow `line-strong` ring, a ring half filled with `break`, or a filled `break` circle with an `on-break` check. The shape is `aria-hidden`; `todayLine` carries the meaning in words ("Not started today", "2 of 5 done today", "Done today, 4 of 5"). Without `todayLine` a plain default stands in. An unknown value reads as not started.
- `children` are the steps, usually read-only `RoutineItem`s, stacked with `gap-2`.
- `actions` holds Start and the More `PopoverMenu`, top right; it wraps under the name in a narrow window. Only one Start on the page is `primary`; the host decides which.
- `footer` holds the `WellnessNote` of a templated routine.
- The `routine` hue is the 4px start edge only, a mark that holds 3:1 on `surface-raised` in both themes. Nothing else in the card carries it, and no state depends on it.

Do: let the page set the width; the card fills it. Don't: colour the today line, or say how far behind a routine is.
