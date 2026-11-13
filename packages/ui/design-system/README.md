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
- `line` is a hairline that carries no meaning. `line-strong` is for marks that do: control borders, the timer track and the strip track, tooltip, popover, Kbd and floater edges, segment separators, the scrollbar thumb, `BarRow` fills, hollow habit dots, the overflow hatch. It holds 3:1 on every surface and tint.
- `ink-muted` as a mark means paused or shallow only (the paused arc and strip fill, the hollow mode shapes). A neutral bar is `line-strong`, never `ink-muted`.
- **The floater's edge.** The floating timer's boundary is shared by its fill and its 1px `line-strong` edge: in every theme × wallpaper combination at least one of the two holds 3:1 (see `FloatingTimer`). Its controls are measured against the floater's own fill. The repo's contrast check, `verification/contrast.py`, carries light (#EDEDED), mid-grey (#808080) and dark (#1C1C1E) wallpaper fixtures.
- `selection` (an alias of `focus-soft`) is the ground of a selected card, row, command or rail item, always with a word, a check or `aria-current`.
- `critical` appears once in the whole app: the confirm button of the delete-data `Dialog`. Never on a card, in a list or for time.
- Dark is a first-class theme, not an inversion: deep slate ground, lighter hues, dark `on-` text. In dark, raise with `surface-raised` and `surface-overlay`; borders separate and shadows barely exist.
- **Theme override.** An app picks a theme with `data-theme="light"` or `"dark"` on `<html>`; without it the system appearance applies.

Don'ts that would have caused real bugs: no `filter` or `opacity` to make states; no `surface-sunken` as a mark on `surface` (1.1:1); no `amber` for anything that is not "almost up" or "at limit"; no colour change without a word or shape change beside it.

## Type

- `body` in Atkinson Hyperlegible Next (`--font-sans`) for running text, task titles, buttons and fields. `title` for screens and dialogs, `heading` for sections and columns, `body-sm` for metadata and helpers, `label` in uppercase for chips, `caption` for counts and rail labels. `display` at most once per screen.
- Every countdown, clock and duration, and every key cap (`kbd`), is `--font-mono` (Atkinson Hyperlegible Mono, the Mono group) with tabular digits and zero tracking: `timer-xl` full screen, `timer-lg` in the ring (a fluid ring scales it, never below `timer-md`), `timer-md` in the floating timer and as the floor for the strip's digits, `timer-sm` for small clocks and durations (SessionSlot, NowLine, hour labels, rows), `kbd` in a `Kbd`. The native menu-bar item is the exception: its title is plain system text (see `MenuBarTimer`, Menu-bar glyphs). Full-screen digits shrink with the ring; a countdown is never clipped.
- Formats: a countdown is `18:42`; a wall clock is `09:41` in the user's locale; a tracked duration is `0h 52m`; a duration choice is `25 min`; task metadata is `Est 3 · Done 1 · 0h 25m`. Seconds appear only in countdowns.
- Pass a spoken `remainingLabel` ("18 minutes 42 seconds") to timers. Timers are `aria-live="off"`; milestones are announced once by the host.
- The reading-comfort setting (`[data-reading-comfort="true"]`) swaps `body`, `body-sm`, `heading` and `title` to `--font-alt` (Lexend). It never touches timer digits.
- Keep running text within about 65 characters.
- The token sheet emits one CSS font shorthand per type style, `--type-<name>` (for example `--type-body-sm: 400 13px/18px var(--font-sans)`), so app code never writes a font size, line height or family.
- **Fonts ship inside the app bundle.** Atkinson Hyperlegible Next, Atkinson Hyperlegible Mono (Braille Institute, SIL OFL 1.1) and Lexend (SIL OFL 1.1) ship as unmodified upstream `woff2` files under `packages/tokens/fonts/`, each beside its `OFL.txt`, and `type.fonts` lists them: one variable file each for Atkinson Hyperlegible Next and Atkinson Hyperlegible Mono (weights 200 to 800), and Lexend's static Regular (400, the only weight `alt` uses). The token sheet emits one `@font-face` per entry. The `@import` at the top of `bundle.css` exists for the design-system preview and must not ship: a private app does not ping a font CDN.

## Layout and hit targets

- A 4px base: `space-1` to `space-8`, plus `space-1-5` (6px) for the gap between a shape and its label. Cards pad `space-4`; cards and columns sit `space-5` apart; sections `space-6`.
- `radius-sm` for fields and choices, `radius-md` for buttons, cards and blocks, `radius-lg` for dialogs and wells, `radius-pill` for chips and the primary Start.
- Numbers: `rail-width` 64px, `window-min-width` × `window-min-height` 360×240 (the default window stays 900×600), `content-width` 720px on Today, in reviews and in the Settings content column, `column-min-width` to `column-width` (200 to 280px) on Board, `panel-width` 420px for dialogs and the capture pad, `timer-min-size` 160px to `timer-full-size` 560px for a fluid ring (`timer-size` 280px at the default window), `floater-*` for the floating timer.
- **Window classes.** Minimum 360 × 240, default 900 × 600. Compact below `layout-compact-width` or `layout-compact-height`. Today and the Focus window use the strip when the content box is wider than twice its height and under `layout-strip-height`, and under `layout-ring-min-height` use the strip from `layout-compact-width` wide and the stacked strip below it. Layout switches on resize only. The floater is its own composition (`FloatingTimer`), sized by the `floater-*` tokens; it never uses the strip and never changes layout by shape.
- **Pages never scroll; regions do.** Timer surfaces never scroll at all: fixed tracks plus one flexible time track with a floor. List pages scroll only inside one `ScrollRegion` with a visible bar and "More below". Verified by the Playwright WebKit layout test before any code change that depends on it. The approved a-timer Sizes board is the source of the size set; the test covers at least: windows 360×240, 360×360, 640×330 (strip from `layout-compact-width` under `layout-ring-min-height`), 640×480, 900×240, 900×600, 1440×900 and 3440×400; the Focus window at 1280×720 and 1920×1080; the floater at 280×56, 280×64 and 360×96 in every state (running, paused, warning, idle, ended, deep). Cases: the longest status line beside the widest action ("Open Settings"); the stacked strip running (chip plus a two-line store line); status row exactly 44px; `scrollHeight <= innerHeight` on Today, Focus and Floating.
- **Compact never drops a control.** Compact pages append every regular control inside the region, in order.
- **Board never scrolls sideways.** Columns fold into strips in one order everywhere: Doing, Today, Inbox, Backlog; Done starts folded; the compact column picker opens on Doing.
- **Narrow fallbacks.** Below 400px of content the summary drops the preset name and Start reads "Start"; in both strips the idle summary drops the length the digits show. Accessible names never shorten.
- The day calendar is 2px per minute (`minute-scale`), with hour labels in `timer-sm` `ink-muted` in the `hour-gutter`: a 15-minute block is 30px and becomes a one-line compact block; a 30-minute block is 60px and fits two lines. The floor is `hit-floor` (24px); blocks never overlap to grow their targets. The editor provides keyboard reschedule.
- Anything clicked is at least `hit-min` (44×44px): buttons, fields, routine rows, radio and checkbox choices, command rows, rail items. `control-sm` (28px) is the chip height and is never a target.

## States

| Component | Hover / pressed | Disabled | Selected or active |
| --- | --- | --- | --- |
| Primary and break buttons | `-hover` then `-pressed` fill | `surface-sunken`, `ink-muted`, dashed `line-strong`; label stays readable; `loading` says "Starting…" | n/a |
| Quiet and ghost buttons | `surface-sunken` then `selection` | same dashed neutral | n/a |
| Critical button | `critical-soft` ground, `critical` text | same dashed neutral | n/a |
| TaskCard (with `onOpen`) | `surface-sunken` then `selection` | dashed border | `selected`: `selection` + "Selected"; `active`: `focus` bar + "In progress" |
| TimeBlock (with `onSelect`) | title underlined | dashed border | `selected`: dashed border + "Selected"; `now`: `focus` bar + "Now" |
| RoutineItem | `surface-sunken` then `selection` | dashed border | done: filled `break` check, `ink-muted` label, no strike-through |
| Input, TextArea, radio and checkbox choice | `focus` border | `ink-muted` text, dashed border | checked choice: `selection` ground; a radio shows a filled `focus` dot in a circle, a checkbox an `on-focus` tick in a filled `focus` square |
| NavRail item, command row | `surface-sunken` | omitted, not greyed | `selection` ground + `focus` side bar + `aria-current` or "Selected" |
| Timers | none | none | `warning`: triangle + "Almost up"; `paused`: bars + frozen arc; `idle`: hollow circle + "No session" |

Keyboard focus is a 2px `focus-ring` outline with a 2px offset on links, buttons, fields, selects, summaries and explicit tab stops. It is never clipped and never reused to mean anything else.

- **Nothing disabled without a reason.** Every disabled control has a visible line that says why.
- **Select is not open.** A click or an arrow key selects a card or row; Return, a double-click or Open opens it. Hover never uses the selection ground.
- **One state word, one time left.** The chip is the only state word and the digits the only time left on a surface. Summaries lead with the preset: running "Classic · ends 15:20", paused "Classic · 25 min", strip idle "Classic · ends 15:20". The menu-bar menu has no chip, so its header line carries the word.

## Motion and the two-minute cue

- `duration-quick` for hover and press; `duration-calm` for mode changes and ring steps; `duration-slow` only for the two-minute colour fade. The breathing circle on the intent prompt is the only looping animation (`duration-breath`, 4s in, 4s out).
- At two minutes the word and the shape switch at once; the ring, chip and strip colour fade into `amber` over `duration-slow` on `easing-calm`; one soft chime if sound is on; one warning-tone status-row line ("Two minutes left. Finish the thought."). Never red, no modal, no flash, no repeat, never `critical`.
- Under `prefers-reduced-motion`, every animation and transition is removed and the breathing circle is static at full size. State changes are immediate and still readable.

## Dialogs, capture and notifications

- `Dialog`, `IntentPrompt`, `CapturePad` and `CommandPalette` are native modal dialogs (`showModal()`): the background is inert, focus is contained, focus returns to the trigger. Mount one at a time and keep the trigger mounted. They use `useId`, so React 18 or later is required.
- Escape always does the safe thing: back to focus in the intent prompt, cancel a deletion, close the palette, save a non-empty capture. Clicking a backdrop never dismisses.
- `scrim` sits only behind the intent prompt and the delete-data dialog. Capture and commands keep a clear backdrop.
- One `Toast` at a time, bottom centre, until dismissed; if the host expires it, never under eight seconds and never while hovered or focused. Notices are `role="status"`.
- macOS system notifications are used only for session end and the two-minute cue, never for stats.

## Keyboard and menus

- **Single-key shortcuts.** Space, F and P follow a Single-key shortcuts setting (default on, WCAG 2.1.4) and exist only on Today, the Focus window and the floater; each also has a ⌘ combination or a focusable control. Space acts on the page only when focus is on the heading or body. After Start, focus moves to Pause; after End, to Start. Pages with fields (Settings) have none, including focused-row letter keys. Copy never promises a single key a setting can turn off: tooltips, tips and captions show a single-key `Kbd` only while the setting is on and drop it when off (the Focus caption reads "⌘. ends · Esc leaves", the preset tooltip "Change preset"), and `aria-keyshortcuts` follows the same switch.
- **One menu model.** Navigation, commands and context menus are native NSMenus (Pages, Focus view, the menu bar, the floater, card context menus). The only in-webview menu is `PopoverMenu`, for a choice that needs radios and a heading. Destructive items open the destructive `Dialog`.
- **⌘↩ starts focus everywhere** with the selection or the page's target; ⌘K's first result is always the available start command.
- **Lists are one tab stop.** The rail, board, day grid, routine list, tray, app lists and command list use roving focus.
- **Esc closes the innermost thing first:** tooltip, then a recording shortcut field (cancels recording) or an edited field (restores the saved value), then menu, select or popover, then dialog (the capture pad saves first when it has text), then a step flow. One press does one thing. Esc never stops a session.
- **⌘F** opens Filter on Board and search in the `AppPicker`; it means nothing else.
- **Arrivals focus headings.** Arriving on a page focuses its `h1` (the visible title, or visually hidden when a compact picker replaces it); on a section, that section's heading; relaunching into a running session focuses the hidden "Today" `h1` so a stray Return presses nothing. ⌘[ goes back.
- **Label in name (WCAG 2.5.3).** A control with visible text never gets an `aria-label` that drops it; compose names with `aria-labelledby`; key glyphs are spoken as words; `aria-invalid` only on roles that allow it.

## Pages and flows

- **One primary at the header's end** of a `PageFrame` (or a flow's footer); while a session runs it becomes the `SessionSlot`.
- **Overviews show; flows decide.** Overviews hold numbers and read-only lists; anything written or chosen lives in the flow its primary opens.
- **A step applies on Continue.** End keeps earlier steps and discards the current one; nothing is deleted; optional steps have a visible "Not now".
- **Saving model.** Settings save on change with no Save button and no primary; text and number fields save on blur or Return; Esc restores the saved value. The save line confirms only minute fields and the shortcut; choices confirm themselves. It returns to rest on the next change or page visit, never on a timer.
- **Failed saves are never silent (#112).** Roll back, say why beside the setting and in the status row, offer Try again; the index says it in words (see `InlineNotice`, status-row slots).
- **First run.** No screens or questions before the first session; Today opens at the default size with Start focus holding keyboard focus; the only first-run copy is "Welcome. Nothing to set up."; defaults Classic 25/5, match system theme, notifications off, tracking and blocking off, ⌃⌥F on; no permission at launch or at Start.
- **One-time tips.** Only in Today's status row, only while idle, at most one per idle stretch, starting with "Tip:" and one "Got it" (VoiceOver "Got it, hide this tip"); seen after Got it, after using the feature or after the second showing, never on Start; two tips in total, no setting; never coach marks, overlays, pulses, dots or badges. A returning user is never welcomed back, counted or recapped.
- **Permissions at the moment of need.** Asked only from the control that needs them; the ask says what happens without it; never during focus; a denial is a plain line with no shape and a quiet "Open System Settings", never amber or critical, re-read when the window regains focus, never re-asked and never turned on by the app. Offers can be set aside with "Not now", leaving a quiet way back.

## Voice

Write like a calm, knowledgeable friend: plain words, short sentences, second person, no exclamation marks, no emoji, no guilt.

- Do: "Is this what you intended?" · "Back to focus" · "Two days off. Today is a fresh start." · "Shutdown complete." · "Nothing here yet. That's fine."
- Don't: "You broke your streak!" · "Stay productive!" · "Warning: distraction detected" · "2 of 1 sessions".
- Buttons say what happens: "Start focus", "Take a break", "Wait 10 minutes, then decide", "Delete tracking data".
- Wellness content always carries `WellnessNote`: "Wellness suggestion, not medical advice." Weak-evidence practices are marked optional or experimental.
- Say "Pomodoro-style", never "Pomodoro®", in public copy.
- **Review shows time, not scores.** Durations only; no percentages, ratios, "missed" or streaks; a reached goal is said plainly ("You reached your 12h goal.").
- **Capture confirms by closing.** "Saved to Inbox." once; no toast, no badge.
- **Usage is reflective, never live; private means nameless.** No live foreground-app display; running apps appear only in `AppPicker`; usage appears in Review and session summaries only while recording is on; a never-recorded app's name is never stored and its minutes count only toward one anonymous "Private apps" total and app switches; with recording off the usage line is absent, never zero.
- **Strength copy is friction copy, and every rule is a visible row.** Use the four strength sentences (Gentle, Firm, Strong lock without and with the helper, keyed on helper approval alone); waits are clock times, never countdowns; End stays available during Strong lock and asks once. Nothing is paused without a row the user can see and change (the browser fallback is a normal Distracting row).
- **Copy patterns.** Load errors: "Orasenda can't load <thing> right now." + Try again + "It's kept on this Mac." Store errors: "Orasenda can't save <thing> right now." + optional clause. Refusals say what didn't happen, why, and where to change it (see `InlineNotice`, status-row slots).

## Iconography and naming

- Mode shapes are built in: circle, half circle, rounded square, triangle, hollow circle, pause bars. The rail uses thin rounded line icons at 1.5px stroke, always with a label. No emoji in the interface.
- **Mode shapes are reserved for modes.** Circle, half circle, rounded square, triangle, hollow circle and pause bars mean modes only. App roles use the role glyph family (`RoleTag`; Neutral is an outlined circle with a horizontal bar, never the hollow circle; the Focus role's filled circle is the one deliberate reuse, because it means the Focus mode); errors and "needs you" use the alert glyph (an outlined circle with a short vertical bar and a dot, 14px, 1.5 stroke, `ink`); info uses the info glyph. All in `ink` or `ink-muted`, always with a word.
- **The play glyph means a focus session starts.** Only Start focus (and the floater's Start pill) carries it. Start routine, Start shutdown and Start weekly review are words only.
- **Icon set.** `Icon` draws 20 line icons from one table (play, pause, stop, expand, collapse, window, menu, chevron, close, back, alert, info, pages, jump and the six rail icons) on a 20-unit grid at a 1.5 stroke, `aria-hidden`, in `currentColor`. The role glyphs arrive with P5. No placeholder glyph ships.
- Components set `data-slot`; no `os-` classes.

## Accessibility

- Text pairs meet 4.5:1 and marks meet 3:1 in both themes (verified for every declared pair).
- Every control is a native element reachable by keyboard and labelled for VoiceOver. Cards and blocks are buttons only when they have a handler, so there are no dead tab stops.
- Forced-colours mode keeps borders on chips, dots and the ring, and adds a check glyph to done dots.
