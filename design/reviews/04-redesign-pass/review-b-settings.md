# Orasenda design pass, phase 3 review: Settings

- Date: 2026-11-09
- Reviewer: senior product design reviewer (fable)
- Canvas: https://claude.ai/artifact/GrTgYRHtYxbKh7RVBpbQn1 (read as files, not rendered: `canvas.json`, `Settings.dc.html`, `settings.css`, `orasenda-tokens.css`, Main, Sizes-Light/Dark, States-Light/Dark, Keys, Reach, Calls)
- Checked against: SPEC §1 principles and the owner's rules; owner direction 3 and 4; `03-direction-pick.md` (Still Point, grafts and must-fixes); `01-brief.md` §2.1, §2.2, §3.6, §4, Q4, Q16, Q21; design system README, `tokens.json`, `Input`, `Choice`, `InlineNotice`, `Button`, `Dialog`, `NavRail`, `EmptyState` READMEs; spec A (`settings_set`, `SettingsError`, store states, notification states); issue #112; `tauri.conf.json` and `package.json` for the About facts.

## Verdict: approve with changes

The design is right in its shape and in its philosophy. One quiet scrolling page with a section index beats the brief's drill-in panes: five short sections, one Tab path, every section two keystrokes away at 360×240, and the index doubles as a summary in words. No primary and no Save button is the correct call for a preferences page (the brief asked for exactly that). Configuration is off Today, so nothing here costs a decision while working. The three-track layout (44 header, 44 save line, flexible body, only the body scrolls, scroll track always drawn) makes "nothing falls off" true by construction: 16 + 44 + 8 + 44 + 8 = 120 fixed at 360×240, leaving a 120px body, as the canvas claims. Notifications are off by default and the only thing that asks macOS is the checkbox; the denied state has words and "Open System Settings"; nothing is disabled without a reason; no amber, no red, no exclamation marks, no emoji; every state is drawn in both themes. Failed saves are never silent (#112).

What stops a plain approve: two copy lines are not honest in every state the spec can produce, the shortcut recorder's accessible name drops its visible label, and the Settings store copy diverges from Today's for the same condition. All are fixable on the canvas in one pass, before implementation. No blocker.

## Contrast, by script

`python3 -I contrast.py …` on every pair the canvas uses (the designer's list plus pairs I found in `settings.css`). Text needs 4.5:1, UI marks 3:1.

| Pair | Role | Light | Dark | Result |
|---|---|---|---|---|
| ink / surface | title, headings, labels, error and saved lines | 13.23 | 14.54 | pass |
| ink-muted / surface | helpers, at-rest save line, units, ghost IconButtons | 5.36 | 7.52 | pass |
| focus / surface | ghost actions (Show, Try again, Use ⌃⌥F, licences), current index name | 5.31 | 8.74 | pass |
| ink / surface-raised | choice chips, quiet buttons, kbd | 14.57 | 13.05 | pass |
| ink-muted / surface-raised | rail labels, chip meta ("25/5") | 5.91 | 6.75 | pass |
| focus / selection | current rail item, current index name | 4.86 | 6.43 | pass |
| ink / selection | checked chips, recorder while recording | 12.11 | 10.69 | pass |
| ink-muted / selection | current index value, recorder hint while recording | 4.91 | 5.53 | pass |
| ink / surface-sunken | minute fields, recorder keys | 11.88 | 15.34 | pass |
| ink-muted / surface-sunken | recorder hint, disabled text, units | 4.82 | 7.94 | pass |
| focus / surface-sunken | recorder hover border (mark) | 4.77 | 9.23 | pass |
| ink / surface-overlay | tooltips, jump menu, preset popover, dialog title | 14.57 | 11.97 | pass |
| ink-muted / surface-overlay | tooltip kbd, menu values, dialog body | 5.91 | 6.19 | pass |
| focus / surface-overlay | "Edit times in Settings" in the popover | 5.85 | 7.20 | pass |
| critical / surface-overlay | critical button text when the Dialog shows it on `critical-soft` hover (E only) | 6.79 | 6.62 | pass |
| on-focus / focus (mark) | checkbox tick | 5.94 | 9.23 | pass |
| focus / surface-raised (mark) | radio dot in a chip | 5.85 | 7.85 | pass |
| line-strong / surface (mark) | field, recorder and button borders, scroll thumb, kbd edge | 4.35 | 5.56 | pass |
| line-strong / surface-raised (mark) | choice chip borders, kbd edge | 4.79 | 4.99 | pass |
| line-strong / surface-sunken (mark) | field and recorder borders | 3.90 | 5.87 | pass |
| line-strong / surface-overlay (mark) | tooltip, menu, dialog edges | 4.79 | 4.58 | pass |
| line-strong / selection (mark) | border of a checked chip; recording recorder has `focus` border instead | 3.98 | 4.09 | pass |
| focus-ring / surface (mark) | keyboard focus outline | 5.31 | 8.74 | pass |
| focus-ring / surface-raised (mark) | focus outline on chips and quiet buttons | 5.85 | 7.85 | pass |
| focus-ring / surface-sunken (mark) | focus outline on fields and the recorder | 4.77 | 9.23 | pass |
| focus-ring / selection (mark) | focus outline on the current index item | 4.86 | 6.43 | pass |
| on-critical / critical | "Delete all data" (E only) | 6.90 | 8.49 | pass |

Informative, not marks: `surface-sunken` on `surface` (1.11 / 1.06) is the index hover ground, which the README allows for NavRail and command rows because hover is not a state that carries meaning; the `line` hairlines (1.46 / 1.45) between rows and under the save line carry no meaning, as the README requires. `--all-text` reports 12 FAIL lines, all `line-strong` as *text* on surfaces and tints; the canvas never uses `line-strong` as text. Every pair the canvas uses passes in both themes.

## Findings

Severity: blocker (breaks a principle or an owner rule), major (wrong or dishonest in some real state, or fails an accessibility rule), minor (polish or a documentation gap).

### b-settings-1 · major · "Your last saved settings are shown" is false after a failed read at launch

`save="unavailable"` reads "Orasenda can't save settings right now. Your last saved settings are shown." Spec A §store states: when the store cannot be read at launch, `settings_get` returns **defaults** and the scheduler retries every second; when a write fails mid-flight the in-memory values (the last saved ones) are shown. One line covers both, and it is wrong in the first case. Honesty is a principle.

**Fix.** Make the line true in both cases: "Orasenda can't save settings right now. Changes you make here may not be kept." Keep "Try again" (it retries the read and the owed write). When the store recovers, the save line returns to rest and the index values refresh. Add a second `unavailable` frame at launch with defaults in the controls, so the two cases are visibly the same line.

### b-settings-2 · major · Store copy differs between Today and Settings for the same condition

Settings says "Orasenda can't save settings right now." and "Orasenda couldn't write its data file"; Today (spec A, pick must-fix 3) says "Orasenda can't save sessions right now." and "This data was saved by a newer Orasenda." One store, three phrasings. #112 asks for a spec line for a failed settings save, so new copy is needed, but it has to be one family and it has to land in the spec A amendment, not only on the canvas.

**Fix.** One sentence per store state, used on both pages: `unavailable` → "Orasenda can't save right now." (Today adds "Sessions keep running."; Settings adds the b-settings-1 clause); `write` on a setting → "Break minutes weren't saved. Orasenda can't write its data file. Back to 10."; `newer` → the spec's "This data was saved by a newer Orasenda." plus Settings' "Settings are read-only until you update." Record the mapping (`invalidSpec`, `write`, `unavailable`, `newer`) in the spec A amendment that Q4 already requires, and cite #112 there.

### b-settings-3 · major · The shortcut recorder's accessible name drops its visible label

`<button class="st-rec" aria-label="Start or pause focus from anywhere: Control Option F. Press to change.">` shows "⌃⌥F" and "Change". WCAG 2.5.3 (Label in Name, level A): the visible text must be in the accessible name, or voice-control users saying "click Change" get nothing. The `aria-label` also hides the live content (while recording, "Type the new keys"). And `aria-invalid` is not allowed on `role=button` in ARIA 1.2.

**Fix.** Drop `aria-label`. Give the row label an id and use `aria-labelledby="row-label st-rec-keys st-rec-hint"` so VoiceOver hears "Start or pause focus from anywhere, Control Option F, Change" (use `aria-label="Control Option F"` on the keys span alone so glyphs read as words). Put the conflict and VoiceOver lines in `aria-describedby`. Replace `aria-invalid` with the thick border and the triangle line already drawn. Update the Keys board's VoiceOver table accordingly.

### b-settings-4 · major · The at-launch and smallest-regular frames are not at the true thresholds

Every state frame is 680×520, captioned "the smallest regular window". The brief's thresholds (§4 item 3) make 640×480 the smallest regular size. At 640×480 the content column is 640 − 64 (padding) − 64 (rail) − 200 (index) − 32 (gap) − 18 (scroll track and inset) = 262px: the two 220px minute fields stack, the 200px recorder plus "Turn off" wraps, and the longest helper ("On here, but macOS has notifications off for Orasenda. Allow them in System Settings and Orasenda will use them.") runs to four or five lines. That is probably fine, but it is the edge, and it was not drawn.

**Fix.** Redraw the States boards at 640×480, or add one 640×480 frame per section in both themes (Focus times with both fields and the write failure, Notifications deniedOn, Keyboard conflict). Either way, state the threshold on the board as 640×480.

### b-settings-5 · minor · Choice chips are centred inside left-aligned rows

`bundle.css` has `.os-choice-group { justify-content: center; }` (for Today's centred preset group). `settings.css` only sets `align-self` on the chips, so in every row the theme and preset chips centre within the 720px content column while the legend, helper and fields sit at the start. Unrendered, so unseen.

**Fix.** `.st-row .os-choice-group { justify-content: flex-start; }` in `settings.css`, and record in the `Choice` README that centring is Today's modifier, not the default.

### b-settings-6 · minor · "Saved. Theme is now Dark." is announced twice and stays until you leave

The save line is `role="status"`; after a radio or checkbox change it reads "Saved. …", so VoiceOver hears the native "Dark, selected radio button" and then "Saved. Theme is now Dark." The line then stays until the next page visit, so a page shows a stale "Saved" long after the fact.

**Fix.** Confirm in the save line only what has no native confirmation: minute fields and the shortcut (they are the saves that can be missed). Choices and checkboxes confirm themselves with the `selection` ground and the new index value; the save line stays at rest. Keep the rule "never changes on a timer".

### b-settings-7 · minor · Preset helper promises a key that can be off

"You can also switch on Today with P." is false while *Single-key shortcuts* is off (Keyboard section, same page).

**Fix.** "You can also switch on Today from the preset line." Keep "P" in the All shortcuts table, where the Single-key note already applies, or render the helper from the setting.

### b-settings-8 · minor · The "Apps and sites" slot has no interim content

Brief §3.6 item 5: before P5/P6 the section is an `EmptyState` that says what will come and that nothing is recorded. The canvas leaves a slot in the index and nothing on the page. If Settings ships before the tracking screens, a user looking for "does this app watch me" finds only the About line.

**Fix.** Add the interim row to the canvas: heading "Apps and sites", one line "Nothing is recorded yet. Choosing which apps count as focus or distraction comes in a later update.", no action. Hand the final section to the tracking canvas.

### b-settings-9 · minor · New unnamed sizes

`settings.css` introduces 220px (field), 120px (number input), 200px (recorder), 480px (shortcut table) and a 3px side bar. The side bar matches NavRail; the rest are new. The CLAUDE.md rule is tokens for every size.

**Fix.** Name them in the SettingsRow and ShortcutRecorder READMEs (`field-width` 220, `number-width` 120, recorder reuses `field-width`) and add the two tokens to the design system alongside `index-width` and `scrollbar-size`, or derive them (`column-width` − `space-5` × 3 = 208 for the recorder is not worth the arithmetic; name them).

### b-settings-10 · minor · One failure reported in three places

A write failure appears beside the field, in the save line and in the index. The field and the save line are enough: the save line exists for the scrolled-away case, and the index is visible only when the save line also is. Three triangles for one failure is more than calm needs.

**Fix.** Keep the index value as plain words ("Not saved") without the triangle; the triangle lives beside the field and in the save line. The conflict case ("Pick a new shortcut") stays, because a registration failure can arrive at launch with no save-line event.

## Checks that passed

- **Principles.** No primary and no Save button (brief §3.6 asked for none). Every state carries a word and a shape: triangle for "needs you", check for saved, `selection` + side bar + `aria-current` for the current index item, the Input's thick border for out of range. No amber or red anywhere; `critical` only inside the destructive Dialog (E). Copy is plain and kind: "Off is a choice, not an error", "No sessions yet", no exclamation marks, no emoji, "Pomodoro-style". Theme switches with no cross-fade; the tooltip waits `duration-quick` and is instant under reduce-motion.
- **Owner direction 3 and 4.** Notifications off by default; the checkbox is the only trigger of the macOS prompt; Don't Allow turns the box back off; denied shows "Open System Settings"; a preference ticked while macOS blocks it is kept and said in words; the status is re-read on focus. Theme system/light/dark sets the native title bar and menus (Q16). Presets include Classic 25/5 Pomodoro-style, 50/10, Deep Block 90 and Custom with the decided helpers "Between 5 and 180 minutes." and "Between 1 and 60 minutes.", both always visible. Out-of-range keeps what you typed and names the value in use. Typing never switches the preset.
- **Direction and brief IA.** Still Point's frame, IconButton, tooltip and native-menu rule are reused (`sp-` rules copied). Rail of six, ⌘6, ⌘, and *Settings…* in the menu-bar menu; ⌘K entries per section; "Edit times in Settings" lands on Focus times with focus on its heading; About Orasenda lands on About and data so there is one About. The brief's compact drill-in is replaced by one page plus a native "Jump to section" menu: a better call (fewer clicks, one Tab path), recorded on the Calls board.
- **Sizes.** 360×240: 120px fixed, 120px body, Pages and Jump to section in the header, title centred at `heading`. 900×600 and 1440×900 with the rail and the 200px index; content capped at `content-width`, spare width left empty. The 900×240 strip is compact by height and uses the compact layout; acceptable, since Settings has no timer composition to protect.
- **Keyboard and VoiceOver.** Tab order is a real DOM sequence (rail → save-line action → index → rows). The index is one roving stop with ↑/↓ and Return to the section heading. Deep links focus headings; ⌘[ goes back. No single-key shortcuts on a page with fields (WCAG 2.1.4 and the brief's Q21). Both icon-only controls have a 44×44 target, a tooltip on hover and focus, Esc dismissal, a VoiceOver label and `aria-keyshortcuts`. Hit targets: index items 52, chips, fields, recorder, summary and ghost actions ≥44. Focus ring 2px `focus-ring`, 2px offset, never clipped; `scroll-padding-block` keeps the focused control inside the scroll region.
- **About facts.** Version 0.1.0 matches `package.json`; the data folder `~/Library/Application Support/com.veloud.orasenda` matches the Tauri identifier; "Orasenda doesn't use the network" matches spec A's capabilities (no http, no shell), with the designer's note that it changes if an update check is ever added.
- **Type.** The raw sizes in `settings.css` (22/28, 17/24, 15/22, 13/18, 12/16) match `title`, `heading`, `body`, `body-sm`, `caption` exactly; the canvas token sheet has no type variables, so this is acceptable on the canvas but the implementation must use the type classes.

## Calls I accept as recorded

- One scrolling page with an index, not drill-in panes.
- Section names Appearance, Focus times, Notifications, Keyboard, About and data (the brief's General/Timer/About/Data merged where sensible).
- The save line as Today's 44px status row, reused as a fixed track, including at 360×240 where it costs 44 of 240. The alternative (collapsing it at rest in compact) would move content when a failure appears; a fixed track is the Still Point rule.
- Esc restores the saved value in a minute field; ↑/↓ step 1 and ⇧ step 5.
- The error glyph is the Input's existing triangle in `ink`. The design-system question (triangle is also the Warning shape) stays open for the design system, not for this canvas.
- "Turn notifications on" in ⌘K acts directly and asks macOS the first time: permission at the moment of need without opening Settings.
- Depends on Q4: `notify.session_end` defaults to off and `timer_start` stops asking (spec A amendment, together with b-settings-2).

## Not verified here

Fonts in WebKit, the always-visible `::-webkit-scrollbar` inside WKWebView, VoiceOver on a running build, the native menu popup from the webview, and the scroll-position refs in the state frames. These stay on the phase 4 verification list, with the contrast table above as the pass record for the pairs.

---

# Re-review (scoped): Settings, after the designer's fix round

- Date: 2026-11-09
- Canvas version read: `1794246678-db06` (files: `Settings.dc.html`, `settings.css`, `bundle.css`, `orasenda-tokens.css`, `States-Light/Dark`, `Keys`, `Main`, `Calls`, `canvas.json`)
- Scope: only whether each earlier finding is fixed and whether the fixes introduced a new principle violation.

## Verdict: approve

Every finding from the first round is fixed in the files, not only in the report. The fixes add no amber, no red, no exclamation marks, no new colour pair, no new icon-only control, no primary action, and nothing disabled without words. Two small gaps appeared at the edge of the fixes (b-settings-11 and -12); both are minor and can be recorded on the Calls board before implementation without another round.

## Contrast, re-run by script

Only pairs the fixes touched or re-used. The fixes added no new colour pair (the Calls board says so, and `settings.css` confirms it).

| Pair | Role touched by a fix | Light | Dark | Need | Result |
|---|---|---|---|---|---|
| ink / surface | new unavailable, write and newer lines; "Not saved" index value | 13.23 | 14.54 | 4.5 | pass |
| ink-muted / surface | interim Apps and sites line (`.os-empty p`), at-rest save line | 5.36 | 7.52 | 4.5 | pass |
| focus / surface | Try again on the unavailable line | 5.31 | 8.74 | 4.5 | pass |
| ink / surface-sunken | recorder keys, minute fields at 640 × 480 | 11.88 | 15.34 | 4.5 | pass |
| ink-muted / surface-sunken | recorder hint "Change" (now part of the accessible name) | 4.82 | 7.94 | 4.5 | pass |
| line-strong / surface-sunken (mark) | recorder conflict border (1px border + 1px inset shadow = 2px) | 3.90 | 5.87 | 3.0 | pass |
| line-strong / surface (mark) | scroll thumb, field borders | 4.35 | 5.56 | 3.0 | pass |
| ink / selection | recording recorder text | 12.11 | 10.69 | 4.5 | pass |
| ink-muted / selection | "Esc cancels" while recording; current index value | 4.91 | 5.53 | 4.5 | pass |
| focus / selection | current index name | 4.86 | 6.43 | 4.5 | pass |
| focus / surface-sunken (mark) | recorder hover border | 4.77 | 9.23 | 3.0 | pass |

## Finding by finding

| Id | Status | Evidence |
|---|---|---|
| b-settings-1 | fixed | `ST.unavailable.text` = "Orasenda can't save right now. Changes you make here may not be kept.", action Try again. States-Light and States-Dark each carry two unavailable frames: "after a write failed" (`theme-choice="light"`/`"dark"`, so the user's choice is still shown) and "could not read at launch" (no `theme-choice`, so defaults: Match system, Classic 25/5, 45/10, notifications off, ⌃⌥F). The line is true in both. |
| b-settings-2 | fixed | Calls board has the store-state table (`unavailable`, `write`, `invalidSpec`, `newer`) with one shared sentence, a Today clause and a Settings clause, marked for the spec A amendment and citing #112. `ST.failed.text` and the field line are the same string. `ST.newer.text` = the spec's sentence plus "Settings are read-only until you update." Today's clause "Sessions you finish may not be kept." is a better fit than the one I suggested ("Sessions keep running."): it says the risk, not a reassurance. Accepted. The spec edit itself is correctly deferred (repo read-only this pass) and listed under "Not covered here". |
| b-settings-3 | fixed | `<button class="st-rec" aria-labelledby="{label} {keys} {hint}" aria-describedby="{line} {help}">` with the glyph span `aria-hidden` and an `os-sr-only` span carrying "Control Option F" (`.os-sr-only` exists in `bundle.css` line 18). No `aria-label`, no `aria-invalid`. The conflict is `.st-rec-error { box-shadow: inset 0 0 0 1px var(--line-strong) }`, the same rule the Input uses for `aria-invalid="true"` (`bundle.css` line 171), plus the triangle line in `aria-describedby`. Visible words "Change" / "Choose keys" / "Esc cancels" are in the name, so WCAG 2.5.3 holds in all four recorder states. Keys board table updated to match. |
| b-settings-4 | fixed | Both States boards are 640 × 480 frames with `hint-size="640px,480px"`; the lede states the threshold (compact below 640 wide or 480 tall), and `compact = w < 640 \|\| h < 480` in the component agrees. Arithmetic checks: content column 640 − 64 − 64 − 200 − 32 − 8 − 10 = 262px; body height 480 − 32 − 44 − 8 − 44 − 8 = 344px. The three edge cases named (both minute fields plus the write failure, deniedOn's five-line helper, the keyboard conflict) are each drawn in both themes. |
| b-settings-5 | fixed, and the premise corrected | `.st-row .os-choice-group { justify-content: flex-start; }` is in `settings.css`. Reading the bundled `bundle.css` again: the default `.os-choice-group` (line 173) has no `justify-content`; centring comes only from `.os-intent .os-choice-group` (line 154). So the chips were never centred on this canvas; my first-round claim was wrong about the bundle, right about the README. The rule is harmless and the proposed Choice README note ("centring belongs to `.os-intent`") is still the right record. |
| b-settings-6 | fixed | `ST.saved` is used only with `saved-text` for a minute field; the Main dark frame and the States "Saved · a minute field" frame show it. Calls item 4 and the Main board state the rule: fields and the shortcut confirm in the save line, choices confirm themselves; the line returns to rest on the next change or page visit, never on a timer. |
| b-settings-7 | fixed | Helper reads "You can also switch on Today from the preset line." P stays in All shortcuts as "P on Today". README rule added: copy never promises a single key that a setting can turn off. |
| b-settings-8 | fixed | `<section data-sec="apps">` with heading "Apps and sites" and one `.os-empty.st-empty` line: "Nothing is recorded yet. Choosing which apps count as focus or distraction comes in a later update." No action. Index item "Nothing recorded". Jump menu lists it. Drawn in both themes. Tab-order list on Keys updated (no control; heading reached from the index). |
| b-settings-9 | fixed | `--field-width: 220px` and `--number-width: 120px` declared beside `--index-width` and `--scrollbar-size`; `.st-field`, `.st-rec` (min-width) and `.st-num` use them; `.st-keys` caps at `var(--panel-width)` (420, exists in `orasenda-tokens.css`). Both tokens are in the proposed design-system table. |
| b-settings-10 | fixed | `timesTri` is always `false`; the index shows "Not saved" / "Check focus minutes" in words only. Only `KT.conflict.idxTri` is true. Keys board VoiceOver row for the index item spells this out. |

## New findings (from the fixes)

### b-settings-11 · minor · "Saved on this Mac" is undefined when the store can't be read

The new "could not read at launch" frame shows defaults in every control, which is right, but the component's About row still resolves to "38 focus sessions, since 2 November." (`about` defaults to `some`). When `settings_get` is returning defaults because the file can't be read, the session count can't be known either. The frame is scrolled to Focus times so the row is off-screen, but the state is real.

**Fix.** Add an `about="unavailable"` value with the line "Orasenda can't read your sessions right now." (same family as the store sentence), and use it in both launch frames. One line on the Calls store table under `unavailable`, Settings column.

### b-settings-12 · minor · Try again has one VoiceOver label for two different retries

The Keys board gives Try again the name "Try again saving break minutes, button". On the unavailable line, Try again retries the store read and the owed write, not break minutes. The visible word is the same; the accessible name should say what it retries.

**Fix.** Two names: "Try again saving break minutes" beside the field and on the write-failure save line; "Try again, Orasenda can't save right now" (or simply "Try again saving") on the unavailable line. One extra row in the Keys VoiceOver table.

## Checks on the fixes themselves

- **Principles.** No amber, red, exclamation marks or emoji in any new line. New copy is plain and names the value in effect ("Back to 10", "Still using 45"). No new primary; no new icon-only control; the interim EmptyState has no action, as the brief asked. Disabled still always has words (`newer`, notifications `unavailable`).
- **Save-line fit.** The longest new line with an action ("Break minutes weren't saved. Orasenda can't write its data file. Back to 10." + Show) is about 76 characters at body-sm; at 360 wide the message column is roughly 270px, which is two lines, inside the 44px track (2 × 18 = 36). The unavailable line with Try again fits the same way. The newer line has no action and wraps to two lines at 328px. Nothing overflows the fixed track at the smallest size.
- **Both themes.** Every new frame exists on both States boards, frame for frame (seven, six and seven per row).
- **No regressions found** in the tab order, the compact header, the index roving stop, or the dialog (E).

## Not verified here (unchanged)

Fonts in WebKit, the always-visible scrollbar in WKWebView, the composed recorder name under real VoiceOver, the native menu from the webview, and the scroll-position refs. These remain on the phase 4 list.
