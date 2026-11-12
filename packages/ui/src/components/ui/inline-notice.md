A quiet line of guidance in place, and, as `variant="row"`, the reserved status row on Today, the Focus window and every `PageFrame`.

- `children`: one or two plain sentences. `tone: 'warning'` (triangle, `amber-soft`) only for time almost up and WIP limits; everything else is neutral, or `attention` in the status row (the alert glyph, see below).
- `actionLabel` with `onAction` adds one ghost action. `actionName` sets an accessible name that contains the visible text (the row variant's names are in its Actions line). In the row variant, `tone: 'rest'` is the at-rest line in `ink-muted` with no glyph.
- The message is `role="status"`; mount it at the milestone, never on every tick.
- The default variant stays for in-place notices.

## Status row (`variant="row"`)

- **Anatomy:** a fixed 44px row with no box; one ghost or quiet action as a sibling. Today adds a second action as a sibling `Button` beside the row (`StatusRow`, a composition in the app, not a prop here); in the stacked strip the strip's own `ModeChip` is the state word, so the row adds none. The message paragraph is the live region (`role="status"`, `aria-live="polite"`), always mounted and empty when there is nothing to say. The row is never the live region, so chip changes are never announced.
- **Text:** `body-sm` `ink`, at most two lines; it never grows and never truncates. Tip copy is at most 65 characters. Ghost actions are `focus` text (5.31 / 8.74 on `surface`).
- **Tones:** `neutral` (no glyph), `attention` (the alert glyph in `ink`), `warning` (the amber triangle, time only).
- **Actions:** `actionVariant` is `'ghost'` by default, or `'quiet'`; names contain their visible text and say what they retry ("Try again saving break minutes", "Try again saving").
- **Focus:** at a session end the line is announced first, then focus moves to Start focus, with the action one Shift-Tab away.

### Priority

The row holds at most two sentences, in this order:

1. The answer to the person's last action (a start that failed, a failed save).
2. A cadence row or one-shot milestone ("Session ended.", "Your last session ended while Orasenda was closed.", "Two minutes left. Finish the thought."), in the order of Today's table below.
3. The standing store line, joined after a short milestone in the same row ("Session ended. Orasenda can't save sessions right now."). If the two together exceed 65 characters, the higher one shows and the store line returns when it clears. A joined row takes the tone and glyph of its first sentence.
4. The intent button, in a running or paused focus with nothing above: no text, a quiet "What will be done?" ("Edit intent" once one is set).
5. The welcome line (first run only), then the idle rest line ("4 hours of focus today.", `rest` tone).
6. A tip, only when the row is otherwise empty and Today is idle.

### Today slots

| Event | Tone | Message | Action | Clears |
| --- | --- | --- | --- | --- |
| Start error (`timer_start` answered an error other than `alreadyRunning`) | attention | "Focus didn't start. Orasenda's timer isn't responding." | quiet "Try again" (name "Try again starting focus"): repeats the same request | a successful start, or the next view change to running |
| Pause, resume or end failed (`timer_pause`, `timer_resume` or `timer_stop` answered an error other than `nothingRunning`, `wrongState` or `alreadyRunning`, the races under ADR-013) | attention | "Orasenda's timer isn't responding." | none | the next successful command or view change |
| Timer unavailable (`timer_state` failed at launch) | attention | "Timer unavailable. Restart Orasenda to try again." | none | never this launch |
| Natural end, ⌘. or End | neutral | "Session ended." | none ("Got it" only when joined with a tip) | next transition |
| Recovered on launch | neutral | "Your last session ended while Orasenda was closed." | none | next transition |
| Two minutes left, in a focus | warning | "Two minutes left. Finish the thought." | quiet "+10 min" (name "Add 10 minutes of focus") while it is on offer; in an automatic step, quiet "Take a break" (name "Take a break now") instead | the end, or +10 |
| Deep-hours note: the focus that crossed the cap ended | neutral | "You've focused 4 hours today. A good place to stop." | the break's two actions | the next transition |
| A break (also in its last 2:00, which stays the break row) | neutral | the suggestion, its label as the first word: "Optional: look at something far away." Left out in the stacked strip, where only the actions show | quiet "+10 min" (name "Back to focus for 10 more minutes") while on offer, then ghost "Skip break" | the break's end |
| Keep going offer, idle after a `quick` session | neutral | "Keep going?" | quiet "Keep going" (name "Keep going with Steady Focus"), then ghost "Stop here" | any transition, Stop here, a page change |
| Running in an automatic step, not in its last 2:00 | neutral | "Still going · ends 15:40" | quiet "Take a break" (name "Take a break now") | the step's warning, or its end |
| A break ended by time | neutral | "Break over. Start when you're ready." | none | next transition |
| A break skipped | neutral | "Break ended." | none | next transition |
| A focus is running or paused, nothing above | none | empty | quiet "What will be done?" or "Edit intent": it swaps the row for an `Input` | the field closing |
| Idle after the deep-hours cap | rest | "4 hours of focus today." | none | midnight, or a new session |
| Store unavailable | attention | "Orasenda can't save sessions right now." | none (it already retries every second) | while the state lasts |
| Store newer | attention | "This data was saved by a newer Orasenda." | none | while the state lasts |
| First run | neutral | "Welcome. Nothing to set up." | none | first Start |
| Tip | neutral | "Tip: ⌃⌥F starts or pauses focus from anywhere." (spoken "Control-Option-F …") | ghost "Got it" | Got it, use, or second showing |

A start error shows here, on the same screen as Start. Focus stays on Start; the line is announced through the live message; "Try again" is one Shift-Tab away. No red, no amber, no exclamation, no dialog. Every message fits two lines of `body-sm` at 360 wide beside the widest action, "Try again". The three refused-start rows were removed by the owner's ruling on [#120](https://github.com/arkgast/orasenda/issues/120): Today always starts with `custom: null`, so Settings and Rust refuse out-of-range minutes before they are saved.

### Settings slots (the save line)

| Event | Beside the field | Save line |
| --- | --- | --- |
| At rest | helper only | "Changes save as you make them." (`rest`) |
| Field saved | none | "Saved. Custom focus is now 50 minutes." |
| Invalid value | `Input` error: alert glyph + "Between 5 and 180 minutes. Still using 45." (Break: "Between 1 and 60 minutes. Still using 10."); typed value kept, `aria-invalid` | "Focus minutes weren't saved. Still using 45." + ghost "Show" (moves focus to the field) |
| Write failed | "Orasenda can't write its data file." | "Break minutes weren't saved. Back to 10." + "Try again" (name "Try again saving break minutes") |
| Store unavailable | none | "Orasenda can't save settings right now. Changes you make here may not be kept." + "Try again" (name "Try again saving"), only while a failed change is waiting to be resent |
| Store unavailable (About and data row) | "Orasenda can't read your sessions right now." | the save line above |
| Store newer | controls read-only, each with the reason | "This data was saved by a newer Orasenda. Settings are read-only until you update." |
| Shortcut conflict | the recorder's conflict line | none (the index shows "Pick a new shortcut" with the alert glyph) |

Two actions: the first is the notice's own, the second a sibling `Button` in reading order after it. Both keep the 44px hit target. Beside a long line the row may take a second line in a ring layout, and in the strip's narrow column the second action goes under the first row. While the intent field is open it replaces the row; at 360 x 240 it lies over the top of the time.

Do: show one notice at a time, and keep the row's height fixed. Don't: use it to nag about stats.
