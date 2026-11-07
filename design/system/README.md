Orasenda is a calm, local-first focus and time app for macOS. The interface exists to get out of the way: one primary action per screen, no badges, no red alerts, no feeds. Build every screen from these tokens and components so the app feels like the same quiet place everywhere.

## Principles

- **Calm by default.** One `primary` button per screen. Leave space empty; the `space-8` margins around full-screen focus are intentional.
- **Time is always visible.** `MenuBarTimer` in the menu bar, `TimerRing` on Today, `FullScreenFocus` for deep sessions. The ring shows what is left, not what is spent.
- **Never by colour alone.** Every mode and state carries a word or a shape as well as a colour: `ModeChip` always shows its label, "Now" is a word and a bar, "Selected" is a word and a ground.
- **Kind, not judging.** No red for time, habits or performance. Sessions past an estimate are information. A missed day is a hollow dot, not a break in a chain. Metrics are neutral trends.
- **The user is in control.** Friction, never prohibition: the intent prompt always offers an honest way through. Capture notes and bypass reasons stay on the device and can be deleted.
- **Slow motion only.** `duration-calm` on `easing-calm`; nothing bounces, flashes or pulses. Under reduce-motion, nothing moves.

## Colour

Four modes, each a hue with a `-soft` tint; `focus` and `break` also have `on-`, `-hover` and `-pressed` tokens because they are the only solid buttons.

| Mode | Fill | Tint | Shape | Use for |
| --- | --- | --- | --- | --- |
| Focus | `focus` | `focus-soft` | circle | Focus sessions, Deep work, the primary button, "now" and selection markers |
| Break | `break` | `break-soft` | half circle | Breaks, completion, the done check, the Frog label |
| Routine | `routine` | `routine-soft` | rounded square | Routines, habits, Personal blocks: a muted sand, deliberately low in chroma |
| Warning | `amber` | `amber-soft` | triangle | Time almost up, WIP limit reached: the only saturated warm |
| Shallow, paused, idle | `ink-muted` | `surface-raised` | hollow circle, bars | No hue; a `line-strong` outline |

- Text is `ink` on `surface`, `surface-raised`, `surface-sunken`, `surface-overlay` or any soft tint; secondary text is `ink-muted`. Both hold 4.5:1 everywhere, including on `selection`.
- A mode hue reads as text on the surfaces and on its own tint. On a solid fill use the matching `on-` token.
- `line` is a hairline that carries no meaning. `line-strong` is for marks that do: control borders, the timer track, hollow habit dots, the overflow hatch. It holds 3:1 on every surface and tint.
- `selection` (an alias of `focus-soft`) is the ground of a selected card, row, command or rail item, always with a word, a check or `aria-current`.
- `critical` appears once in the whole app: the confirm button of the delete-data `Dialog`. Never on a card, in a list or for time.
- Dark is a first-class theme, not an inversion: deep slate ground, lighter hues, dark `on-` text. In dark, raise with `surface-raised` and `surface-overlay`; borders separate and shadows barely exist.

Don'ts that would have caused real bugs: no `filter` or `opacity` to make states; no `surface-sunken` as a mark on `surface` (1.1:1); no `amber` for anything that is not "almost up" or "at limit"; no colour change without a word or shape change beside it.

## Type

- `body` in Atkinson Hyperlegible Next (`--font-sans`) for running text, task titles, buttons and fields. `title` for screens and dialogs, `heading` for sections and columns, `body-sm` for metadata and helpers, `label` in uppercase for chips, `caption` for counts and rail labels. `display` at most once per screen.
- Every countdown, clock and duration is `--font-mono` (Atkinson Hyperlegible Mono) with tabular digits and zero tracking: `timer-xl` full screen, `timer-lg` in the Today ring, `timer-md` in the floating timer and the full-screen clock, `timer-sm` in the menu bar. Full-screen digits shrink with the ring; a countdown is never clipped.
- Formats: a countdown is `18:42`; a wall clock is `09:41` in the user's locale; a tracked duration is `0h 52m`; a duration choice is `25 min`; task metadata is `Est 3 · Done 1 · 0h 25m`. Seconds appear only in countdowns.
- Pass a spoken `remainingLabel` ("18 minutes 42 seconds") to timers. Timers are `aria-live="off"`; milestones are announced once by the host.
- The reading-comfort setting (`[data-reading-comfort="true"]`) swaps `body`, `body-sm`, `heading` and `title` to `--font-alt` (Lexend). It never touches timer digits.
- Keep running text within about 65 characters.
- **Fonts ship inside the app bundle.** Atkinson Hyperlegible Next, Atkinson Hyperlegible Mono (Braille Institute, SIL OFL 1.1) and Lexend (SIL OFL 1.1) are declared as families only; `type.fonts` is empty because no font files are in this repository yet. The `@import` at the top of `bundle.css` exists for the design-system preview and must not ship: a private app does not ping a font CDN.

## Layout and hit targets

- A 4px base: `space-1` to `space-8`, plus `space-1-5` (6px) for the gap between a shape and its label. Cards pad `space-4`; cards and columns sit `space-5` apart; sections `space-6`.
- `radius-sm` for fields and choices, `radius-md` for buttons, cards and blocks, `radius-lg` for dialogs and wells, `radius-pill` for chips and the primary Start.
- Numbers: `rail-width` 64px, `window-min-width` × `window-min-height` 900×600 (scroll below it; never clip controls), `content-width` 720px on Today, `column-width` 280px on Board, `panel-width` 420px for dialogs and the capture pad, `timer-size` 280px and `timer-full-size` 560px.
- The day calendar is 2px per minute: a 15-minute block is 30px and becomes a one-line compact block; a 30-minute block is 60px and fits two lines. The floor is `hit-floor` (24px); blocks never overlap to grow their targets. The editor provides keyboard reschedule.
- Anything clicked is at least `hit-min` (44×44px): buttons, fields, routine rows, radio choices, command rows, rail items. `control-sm` (28px) is the chip height and is never a target.

## States

| Component | Hover / pressed | Disabled | Selected or active |
| --- | --- | --- | --- |
| Primary and break buttons | `-hover` then `-pressed` fill | `surface-sunken`, `ink-muted`, dashed `line-strong`; label stays readable; `loading` says "Starting…" | n/a |
| Quiet and ghost buttons | `surface-sunken` then `selection` | same dashed neutral | n/a |
| Critical button | `critical-soft` ground, `critical` text | same dashed neutral | n/a |
| TaskCard (with `onOpen`) | `surface-sunken` then `selection` | dashed border | `selected`: `selection` + "Selected"; `active`: `focus` bar + "In progress" |
| TimeBlock (with `onSelect`) | title underlined | dashed border | `selected`: dashed border + "Selected"; `now`: `focus` bar + "Now" |
| RoutineItem | `surface-sunken` then `selection` | dashed border | done: filled `break` check, `ink-muted` label, no strike-through |
| Input, TextArea, radio choice | `focus` border | `ink-muted` text, dashed border | checked choice: `selection` ground, filled `focus` dot |
| NavRail item, command row | `surface-sunken` | omitted, not greyed | `selection` ground + `focus` side bar + `aria-current` or "Selected" |
| Timers | none | none | `warning`: triangle + "Almost up"; `paused`: bars + frozen arc; `idle`: hollow circle + "No session" |

Keyboard focus is a 2px `focus-ring` outline with a 2px offset on links, buttons, fields, selects, summaries and explicit tab stops. It is never clipped and never reused to mean anything else.

## Motion and the two-minute cue

- `duration-quick` for hover and press; `duration-calm` for colour, chip and ring changes. The breathing circle on the intent prompt is the only looping animation (`duration-breath`, 4s in, 4s out).
- At two minutes: the ring, the chip and the menu-bar glyph switch to `warning` over `duration-calm`; one soft chime if sound is on; optionally one `InlineNotice` ("Two minutes left. Finish the thought."). No modal, no flash, no repeat, never `critical`.
- Under `prefers-reduced-motion`, every animation and transition is removed and the breathing circle is static at full size. State changes are immediate and still readable.

## Dialogs, capture and notifications

- `Dialog`, `IntentPrompt`, `CapturePad` and `CommandPalette` are native modal dialogs (`showModal()`): the background is inert, focus is contained, focus returns to the trigger. Mount one at a time and keep the trigger mounted. They use `useId`, so React 18 or later is required.
- Escape always does the safe thing: back to focus in the intent prompt, keep the session in the exit confirmation, cancel a deletion, close the palette, save a non-empty capture. Clicking a backdrop never dismisses.
- `scrim` sits only behind the intent prompt, the full-screen exit confirmation and the delete-data dialog. Capture and commands keep a clear backdrop.
- One `Toast` at a time, bottom centre, until dismissed; if the host expires it, never under eight seconds and never while hovered or focused. Notices are `role="status"`.
- macOS system notifications are used only for session end and the two-minute cue, never for stats.

## Voice

Write like a calm, knowledgeable friend: plain words, short sentences, second person, no exclamation marks, no emoji, no guilt.

- Do: "Is this what you intended?" · "Back to focus" · "Two days off. Today is a fresh start." · "Shutdown complete." · "Nothing here yet. That's fine."
- Don't: "You broke your streak!" · "Stay productive!" · "Warning: distraction detected" · "2 of 1 sessions".
- Buttons say what happens: "Start focus", "Take a break", "Wait 10 minutes, then decide", "Delete tracking data".
- Wellness content always carries `WellnessNote`: "Wellness suggestion, not medical advice." Weak-evidence practices are marked optional or experimental.
- Say "Pomodoro-style", never "Pomodoro®", in public copy.

## Iconography and naming

- Mode shapes are built in: circle, half circle, rounded square, triangle, hollow circle, pause bars. The rail uses thin rounded line icons at 1.5px stroke, always with a label. No emoji in the interface.
- CSS classes are prefixed `os-`: `os-mode-*`, `os-timer-*`, `os-block-*` for kinds and one class per state (`os-card-active`, `os-ritem-done`).

## Accessibility

- Text pairs meet 4.5:1 and marks meet 3:1 in both themes (verified for every declared pair).
- Every control is a native element reachable by keyboard and labelled for VoiceOver. Cards and blocks are buttons only when they have a handler, so there are no dead tab stops.
- Forced-colours mode keeps borders on chips, dots and the ring, and adds a check glyph to done dots.
