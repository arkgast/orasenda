A quiet line of guidance in place, and, as `variant="row"`, the reserved status row on Today, the Focus window and every `PageFrame`.

- `children`: one or two plain sentences. `tone: 'warning'` (triangle, `amber-soft`) only for time almost up and WIP limits; everything else is neutral, or `attention` in the status row (the alert glyph, see below).
- `actionLabel` with `onAction` adds one ghost action. `actionName` sets an accessible name that contains the visible text (the row variant's names are in its Actions line). In the row variant, `tone: 'rest'` is the at-rest line in `ink-muted` with no glyph.
- The message is `role="status"`; mount it at the milestone, never on every tick.
- The default variant stays for in-place notices.

## Status row (`variant="row"`)

- **Anatomy:** a fixed 44px row with no box; an optional `ModeChip` (stacked strip only) and one ghost or quiet action as siblings. The message paragraph is the live region (`role="status"`, `aria-live="polite"`), always mounted and empty when there is nothing to say. The row is never the live region, so chip changes are never announced.
- **Text:** `body-sm` `ink`, at most two lines; it never grows and never truncates. Tip copy is at most 65 characters. Ghost actions are `focus` text (5.31 / 8.74 on `surface`).
- **Tones:** `neutral` (no glyph), `attention` (the alert glyph in `ink`), `warning` (the amber triangle, time only).
- **Actions:** `actionVariant` is `'ghost'` by default, or `'quiet'`; names contain their visible text and say what they retry ("Try again saving break minutes", "Try again saving").
- **Focus:** at a session end the line is announced first, then focus moves to Start focus, with the action one Shift-Tab away.

### Priority

The row holds at most two sentences, in this order:

1. The answer to the person's last action (a refused start, a failed save).
2. A one-shot milestone ("Session ended.", "Your last session ended while Orasenda was closed.", "Two minutes left. Finish the thought.").
3. The standing store line, joined after a short milestone in the same row ("Session ended. Orasenda can't save sessions right now."). If the two together exceed 65 characters, the higher one shows and the store line returns when it clears. A joined row takes the tone and glyph of its first sentence.
4. The welcome line (first run only).
5. A tip, only when the row is otherwise empty and Today is idle.

### Today slots

| Event | Tone | Message | Action | Clears |
| --- | --- | --- | --- | --- |
| Start refused, Custom focus out of range | attention | "Focus didn't start. Custom focus needs 5 to 180 minutes." | ghost "Open Settings" (name "Open Settings to change custom minutes"): opens Settings › Timer and focuses Focus minutes | next Start, a preset change, or a valid save |
| Start refused, Custom break out of range | attention | "Focus didn't start. Custom break needs 1 to 60 minutes." | "Open Settings" (focuses Break minutes) | same |
| Start refused, both out of range | attention | "Focus didn't start. Custom minutes are out of range." | "Open Settings" (focuses the first invalid field) | same |
| Any other start error, or the timer unavailable | attention | "Focus didn't start. Orasenda's timer isn't responding." | quiet "Try again" (name "Try again starting focus") | a successful start |
| Natural end, ⌘. or End | neutral | "Session ended." | none (a tip's "Got it" when joined) | next transition |
| Recovered on launch | neutral | "Your last session ended while Orasenda was closed." | none | next transition |
| Two minutes left | warning | "Two minutes left. Finish the thought." | none | the end |
| Store unavailable | attention | "Orasenda can't save sessions right now." | none (it already retries every second) | while the state lasts |
| Store newer | attention | "This data was saved by a newer Orasenda." | none | while the state lasts |
| First run | neutral | "Welcome. Nothing to set up." | none | first Start |
| Tip | neutral | "Tip: ⌃⌥F starts or pauses focus from anywhere." (spoken "Control-Option-F …") | ghost "Got it" | Got it, use, or second showing |

A refused start shows here, on the same screen as Start. Focus stays on Start; the line is announced through the live message; "Open Settings" is one Shift-Tab away. No red, no amber, no exclamation, no dialog. Every message fits two lines of `body-sm` at 360 wide beside the widest action, "Open Settings".

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

Do: show one notice at a time, and keep the row's height fixed. Don't: use it to nag about stats.
