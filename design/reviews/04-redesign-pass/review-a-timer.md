# Orasenda design pass, phase 3 review: "Timer surfaces"

- Date: 2026-11-09
- Reviewer: senior product design reviewer (fable)
- Canvas: https://claude.ai/artifact/9pNxL32QEEq66j5QyAW1GX (files read, not rendered: `canvas.json`, `Main`, `States`, `States-Dark`, `Sizes`, `Sizes-Dark`, `Amber`, `FocusView`, `FullScreen`, `FullFocus`, `Floating`, `Floater`, `MenuBar`, `Keys`, `Contrast`, `Changes`, `Today.dc.html`, `timer-surfaces.css`, `orasenda-tokens.css`)
- Checked against: SPEC §1, spec A (Today contract, copy lines, `format_remaining`), the design system (`README.md`, `tokens.json`, `bundle.css`, `bundle.js`, the TimerRing, StartButton, MenuBarTimer, FullScreenFocus, ModeChip and InlineNotice READMEs), `01-brief.md`, `02-brief-critique.md`, `03-direction-pick.md`, the owner direction and the decided items.
- Contrast: every pair run by script (`contrast.py` on `tokens.json`), plus a mix check for the fade frames and the floater edge on a mid-grey stand-in (`mix_check.py`, same folder).

## Verdict: approve with changes

The canvas does what phase 3 asked. Every surface shares one stage (summary, 44px status row, one flexible time track, 52px controls row), Start keeps its word and glyph, Pause/Resume/End are icon buttons with tooltips on hover and focus, VoiceOver labels and 44/52px targets, the chip is the only state word, status copy is spec A's, amber appears only with the triangle and the word, nothing is red, and the known issue is closed by construction. All ten must-fix items and all six grafts from the pick are applied and mapped. The layout arithmetic in `Today.dc.html` checks at every drawn size (360×240 stacked strip: 188 fixed + 52 time track; 360×360: ring 172; 640×480: ring 220 with the rail; 900×600: ring 340; 1280×800 and up: 560; 900×240 strip with digits 81px; 640×330 strip with digits 54px). Nothing scrolls on a timer surface.

Three things are wrong enough to fix before the design-system changes go in: the floating timer has no plain idle state and its "Session ended." state overflows the 248px minimum, and the read-only preset popover carries copy that promises a change it does not allow. The rest is polish and sequencing.

## Principles check

| Principle | Result |
|---|---|
| One primary per screen | Holds. Today idle: Start. Running/paused: none (Pause is quiet, End ghost). Focus window idle: Start; running: none. Floater after an end: Start pill in its own window. |
| State never by colour alone | Holds. Chip word + shape everywhere; strip bar carries the triangle; idle digits read "25 min", never fake digits; menu-bar glyph is a template shape. Icon buttons have tooltips on hover and focus, labels and targets. |
| No red; amber = almost up; critical only destructive | Holds. No `critical` anywhere on the canvas; amber appears only in the warning state with the triangle. |
| Kind, plain copy | Holds. No exclamation marks or emoji. One contradiction in the preset popover (a-timer-3) and one rounding nit (a-timer-9). |
| Slow motion, gone under reduce-motion | Holds. `duration-slow` 1600ms for colour only; word and shape switch at once; reduce-motion frame drawn. Bar width transition removed under reduce-motion. |
| Contrast 4.5 / 3, focus ring, keyboard | Holds for every pair used (table below). 2px `focus-ring` outline with 2px offset; tab order drawn; Esc behaviour specified. |
| Calm by default | Holds. One tip, once; no badges; no feeds; notifications never mentioned on Today. |
| Private by design | Holds. No tracking surface here; notifications off by default and only in Settings. |
| Honest friction | Holds. Full screen is a window, not a lock; the leave dialog keeps the session. |
| Productivity | Holds. Start is one keystroke from Today (Space), the app (⌘↩), the system (⌃⌥F), the menu bar (first item) and ⌘K; the Focus view is one button or F; the controls row never moves, so Pause sits where Start was. |
| Owner 1 minimal, responsive Today | Holds. Configuration is one quiet line away or in Settings; three layouts by shape down to 360×240. |
| Owner 2 second screen, chosen each time | Holds. Per-display full screen or floater, from Today, the menu bar and ⌘K; nothing remembered. |
| Owner 3 notifications off, no prompt | Holds. Today never mentions them. |
| Owner 4 Settings | Out of scope here, correctly deferred; the popover links to Settings. |
| Known issue | Fixed: fixed tracks and a floored flexible track; no scroll container exists. |
| Both themes | Every board has a dark counterpart or dark cells. |

## Contrast by script

Text needs 4.5:1, UI marks 3:1. Ratios are light / dark.

| Pair | Role | Light | Dark | Pass |
|---|---|---|---|---|
| ink on surface | text | 13.23 | 14.54 | yes |
| ink on surface-raised | text | 14.57 | 13.05 | yes |
| ink on surface-overlay | text | 14.57 | 11.97 | yes |
| ink on selection | text | 12.11 | 10.69 | yes |
| ink on surface-sunken | text | 11.88 | 15.34 | yes |
| ink-muted on surface | text | 5.36 | 7.52 | yes |
| ink-muted on surface-raised | text | 5.91 | 6.75 | yes |
| ink-muted on surface-overlay | text | 5.91 | 6.19 | yes |
| ink-muted on surface-sunken (Starting…) | text | 4.82 | 7.94 | yes |
| ink-muted on selection | text | 4.91 | 5.53 | yes |
| on-focus on focus (Start) | text | 5.94 | 9.23 | yes |
| on-focus on focus-hover | text | 7.60 | 10.59 | yes |
| on-focus on focus-pressed | text | 9.35 | 12.06 | yes |
| focus on focus-soft (Focus chip) | text | 4.86 | 6.43 | yes |
| amber on amber-soft (Almost up chip) | text | 5.15 | 7.48 | yes |
| fade 25% / 50% / 75% chip text (sRGB mix) | text | 5.23 / 5.44 / 5.43 | 6.61 / 6.80 / 7.11 | yes |
| fade 25% / 50% / 75% arc on surface | mark | 5.70 / 5.89 / 5.83 | 8.70 / 8.81 / 9.09 | yes |
| focus on surface (Got it; arc; bar fill) | text/mark | 5.31 | 8.74 | yes |
| focus on surface-sunken (Got it hovered) | text | 4.77 | 9.23 | yes |
| focus on surface-overlay (radio dot) | mark | 5.85 | 7.20 | yes |
| focus on selection (current-row bar) | mark | 4.86 | 6.43 | yes |
| amber on surface (warning arc, triangles) | mark | 5.51 | 9.53 | yes |
| ink-muted on surface (paused arc, bar) | mark | 5.36 | 7.52 | yes |
| line-strong on surface (ring/bar track) | mark | 4.35 | 5.56 | yes |
| line-strong on surface-raised (Pause edge, floater edge) | mark | 4.79 | 4.99 | yes |
| line-strong on surface-overlay (tooltip, menu, dialog edges, radio rings) | mark | 4.79 | 4.58 | yes |
| line-strong on surface-sunken (board rulers only) | mark | 3.90 | 5.87 | yes |
| line-strong on selection (current row) | mark | 3.98 | 4.09 | yes |
| focus / amber / ink-muted on surface-raised (floater glyphs) | mark | 5.85 / 6.07 / 5.91 | 7.85 / 8.56 / 6.75 | yes |
| focus-ring on surface / raised / overlay / sunken | mark | 5.31 / 5.85 / 5.85 / 4.77 | 8.74 / 7.85 / 7.20 / 9.23 | yes |
| surface on ink (annotation badges) | text | 13.23 | 14.54 | yes |
| line on surface (hairline only) | mark | 1.46 | 1.45 | fails, correctly never used as a mark |
| line-strong on mid-grey wallpaper | mark | 1.23 | 1.25 | fails, correctly not relied on; the floater's own `surface-raised` fill is 3.89 / 4.01 against mid-grey, so the panel itself reads |

Every ratio the designer listed matches the script. The additional pairs I found in the CSS (focus on surface-overlay for the radio dot, focus and line-strong on selection for the current menu row, the three fade frames as marks) also pass.

## Findings

Severity: **blocker** breaks a principle or the owner direction; **major** fix before the design-system changes are written; **minor** polish, fix in passing.

### a-timer-1 (major) The floating timer has no plain idle state
**Where:** `Floater.dc.html` states `running | paused | warning | ended`; `FocusView` says "The button also works while idle: the focus view opens on the idle ring with Start focus"; the menu-bar idle menu offers "Floating timer".
**Finding:** Choosing the floater while idle (from Today, the menu bar or ⌘K) has no drawn state. The only idle-looking state says "Session ended.", which is false before any session. The phase 2 critique flagged this ("needs a plain idle state, not only idle after end").
**Fix:** Add `idle` to the floater: hollow circle, "No session" in `ink-muted` (`body-sm`), the Start pill (glyph + "Start", name "Start focus") in Pause's slot, Open Orasenda. `ended` keeps "Session ended." as its one-shot line and otherwise looks the same. Spoken name "Floating timer, No session".

### a-timer-2 (major) The floater's ended (and idle) state overflows its minimum width
**Where:** `Floating.dc.html` geometry; `Floater.dc.html` ended state; `floater-width/height` tokens (min 248×56).
**Finding:** The ended row is 12 pad + 14 shape + 4 + "Session ended." (about 91px at 13px) + 4 + Start pill (16 + 14 glyph + 6 + "Start" at 17px/600 ≈ 45 + 16 ≈ 97) + 4 + 44 Open + 8 pad ≈ 278px. That exceeds the 248px minimum by about 30px and only just fits the 280 default. Running at the minimum is also tight with Deep Block digits: spec A's `format_remaining(90 min)` is `1:30:00` (seven characters, about 106–118px at `timer-md`), giving about 246–258px, at or over 248. Only the running 248×56 cell is drawn.
**Fix:** Either raise the minimum to 280×56 (the default width; nothing is lost, since 248 fits no state with margin), or at widths under 280 let the ended/idle floater show the hollow circle and the Start pill with "Session ended." / "No session" spoken (`role="status"`) and as the pill's tooltip. I recommend the first: one fewer rule. Draw the ended state and a `1:30:00` running state at the minimum, and add both to the floater's layout test.

### a-timer-3 (major) The read-only preset popover promises a change it does not allow
**Where:** `Today.dc.html` menu `preset` while active: radios `aria-disabled="true"`, heading "Changes apply to your next session."; `Changes` call 4 and the brief's Q17.
**Finding:** The radios are disabled while a session runs, yet the heading says changes apply to the next session. A user who reads the heading tries a radio and nothing happens: dishonest copy and a dead control. The brief's Q17 wording was the ambiguity; the canvas has to pick one.
**Fix:** Keep the popover read-only while running (fewer decisions while working) and make the copy match: heading "Classic · 25 / 5" with a second line "Presets can change between sessions." Keep the current radio visibly checked and the others `aria-disabled`, the Settings row live. Record the call on the canvas and in the PopoverMenu README. (The alternative, live radios that set the default for the next session, is defensible but it is a mid-session decision the brief chose to avoid.)

### a-timer-4 (minor) The first-session tip and "Session ended." land in the same slot at the same moment
**Where:** `States` cell 11 ("Shown once after the first completed session"), status priority rule "store error, then newest milestone".
**Finding:** After the first completed session two lines are due at once: the spec's "Session ended." (must be announced once) and the tip. The priority rule does not cover a tip, so which shows is undefined; if the tip wins, spec A's announcement test fails.
**Fix:** "Session ended." always wins. The tip shows at the next idle Today that has no one-shot line and no store line (in practice the next launch, or after the ended line is dismissed by a transition and the following session ends). Write this into the status-row rule: "tips have the lowest priority and wait for an empty row". Also give the tip an accessible text with the keys spelled out: `aria-label="Control-Option-F starts or pauses focus from anywhere."`, since VoiceOver reads the glyphs as symbols.

### a-timer-5 (minor) The paused summary repeats the ring's digits
**Where:** `Today.dc.html` paused `sum: 'Classic · 18 min left'`; graft 2.
**Finding:** The graft fixed the double "Paused"; the result shows time left twice, in the ring ("18:42") and in the summary ("18 min left"). The pick scored A2 down for exactly this ("the same fact twice on one calm screen").
**Fix:** While paused, the summary reads "Classic · 25 min" (preset and planned length), which is idle's format without the end time, which is unknown. Accessible name "Preset Classic, 25 minutes, paused. Preset details". The chip stays the only "Paused". Apply the same to the floater and menu-bar header ("Paused · 18 minutes left" is fine there because those surfaces have no second digits besides the title).

### a-timer-6 (minor) Idle strip shows "25 min" twice
**Where:** `Sizes` 900×240 idle: summary "Classic · 25 min · ends 15:20" and digits "25 min".
**Fix:** In the strip and stacked strip, while idle, the summary drops the length: "Classic · ends 15:20". The digits carry the length. Accessible name unchanged.

### a-timer-7 (minor) The Focus window's idle summary opens a popover that is not drawn and links to Settings
**Where:** `FullFocus.dc.html` idle: `sp-summary` with `aria-haspopup="dialog"` and the "Edit times in Settings ⌘," row inherited from Today.
**Fix:** Either draw the popover inside the Focus window without the Settings row (Settings cannot open inside a borderless Focus window), or make the summary plain text there (no chevron, no popup) and let P do nothing in the Focus window. I recommend the popover without the Settings row: changing the preset before starting from the Focus window is the one decision that belongs there.

### a-timer-8 (minor) The Keys board overstates Space
**Where:** `Keys` shortcut table "Space: Today, Focus, floater: start, or pause/resume"; `aria-keyshortcuts="Space"` on Start, Pause and Resume.
**Finding:** Space on a focused button activates that button. With focus on End or on the summary, Space does not pause. The brief scopes Space to "the heading or the body, not a control", and the design relies on focus moving to Pause after Start.
**Fix:** Add the caveat to the table and the README rule: "Space acts on the page only when focus is on the heading or body; on a control it activates that control. After Start, focus moves to Pause; after End, to Start." Drop `aria-keyshortcuts="Space"` from Pause and Resume (it describes native activation, not a shortcut) and keep it on Start, where it is the page shortcut.

### a-timer-9 (minor) The menu-bar header rounds down
**Where:** `MenuBar` warning menu: title `01:48`, header "Almost up · 1 minute left · ends 15:20".
**Fix:** Round up like `format_remaining` does ("2 minutes left" at 1:48; the status line says "Two minutes left"). Rule: the header's minutes are `ceil(remaining)`.

### a-timer-10 (minor) The rail is six tab stops before the page
**Where:** `Keys` 900×600 idle: "1 rail (each page a stop; ⌘1–6)".
**Finding:** Six stops before the summary on every Tab pass from the top. The hidden h1 receives focus after a page change, which helps, but a Shift-Tab from the summary walks back through six items.
**Fix:** NavRail becomes one tab stop with roving focus (arrow keys move between pages, Enter or Space activates, `aria-current` kept). Note it under the NavRail change on the Changes board; it is a NavRail README change, not a Today change.

### a-timer-11 (minor) "Timer unavailable" is dropped though it exists in code today
**Where:** `Changes` not covered: "Brief-only error states 'Timer unavailable' and 'Default preset': not in spec A copy"; brief audit T15 cites `Today.tsx:272`.
**Fix:** Keep the designer's call on "Default preset" (no spec copy). For the timer, draw one cell: status row "Timer unavailable. Restart Orasenda to try again." (neutral, no shape), idle ring, Start and Just 2 minutes guarded with the disabled look. Record that spec A needs the copy added in the same amendment as the shortened recovered line.

### a-timer-12 (minor) Real-font measurement is still owed
**Where:** `Changes` not covered; must-fix 5 in the pick.
**Finding:** The 360 idle row (339 vs 328 estimated), the floater at 248 (a-timer-2), the strip digits at ultrawide sizes and the stacked-strip status row with the tip plus "Got it" (about 355px of text and action against 328, so it wraps to two lines as designed) are all estimates. The canvas type forbids rendering, so this is not a fault of the canvas, but nothing may change in the design system or code until it is measured.
**Fix:** Phase 3 layout test (Playwright WebKit, Atkinson Hyperlegible Next and Mono loaded) at 360×240, 360×360, 640×330, 640×480, 900×240, 900×600, 1440×900, 3440×400 on Today; 1280×720 and 1920×1080 on the Focus window; 248/280×56, 280×64 and 360×96 on the floater in every state including `1:30:00`. Assert the controls row is inside the viewport, the status row is 44px, `scrollHeight <= innerHeight`, and no text node overflows its box.

## Calls I accept as made

- Under 360 tall: strip at 640 wide and over, stacked strip below. Closes the gap in the pick.
- Status lines: neutral lines carry no shape; the warning line carries the triangle. "Session ended." has no action.
- The floater edge is `line-strong` in both themes (the brief's `line` fails as a mark); controls are measured against the floater's own fill.
- Full screen: Leave is a top-right icon button mirroring the Focus view button; the controls row matches Today, End included; the summary shows only while idle.
- Today never mentions notifications.
- The shortened recovered line stays; spec A needs the amendment (with a-timer-11's copy).
- A disconnected display closes its Focus window; the session keeps running.
- The `duration-slow` token at 1600ms, colour only, word and shape instant, instant under reduce-motion.

## What must happen next

1. Fix a-timer-1, 2 and 3 on the canvas (three cells and two lines of copy), then refresh the Changes board.
2. Design-first: `duration-slow`, the window and layout tokens, `timer-min-size`, `floater-*` (with the minimum from a-timer-2), IconButton + Tooltip, StatusRow, TimerStrip, FloatingTimer, PopoverMenu, the TimerRing/StartButton/FullScreenFocus/MenuBarTimer/NavRail changes and the README rules go into the design-system artifact, then `design/system/`, then code.
3. The layout test in a-timer-12 lands with the first code change and gates the PR.
4. Spec A amendment: the recovered line, the notification default, "Timer unavailable" copy, the summary wording ("ends 15:20", never "Realistic finish" for a session), and the no-second-"Paused" test extended to the summary.

---

# Re-review (round 2), scoped to the round-1 findings

- Date: 2026-11-09
- Canvas version read: 1794246976-bf1f (files read, not rendered: `canvas.json`, `Main`, `States`, `Sizes`, `FullScreen`, `FullFocus`, `Floating`, `Floater`, `MenuBar`, `Keys`, `Contrast`, `Changes`, `Today.dc.html`, `timer-surfaces.css`, `orasenda-tokens.css`, `ds/orasenda/components/bundle.css`)
- Scope: is each round-1 finding fixed, and did a fix break a principle. Contrast re-run by script for the pairs that changed or failed, plus the six theme × wallpaper combinations for the floater boundary.

## Verdict: approve

Eleven of twelve findings are fixed on the canvas; the twelfth (real-font measurement) is written as the gating layout test, which is all a canvas of this type can do. No fix broke a principle: the idle floater keeps one primary (the Start pill) and carries state by shape and word; the read-only popover says what it does and marks the locked radios by dashed shape, not colour; the guarded "Timer unavailable" buttons use the design system's dashed disabled look; the Focus-window popover closes on Esc without the leave dialog; every new text or mark pair passes 4.5 / 3 in both themes. Two small things remain, both fixable in passing while the design-system changes are written. Nothing blocks step 2 of "What must happen next".

## Round-1 findings, one by one

| Id | Status | Checked |
|---|---|---|
| a-timer-1 | Fixed | `Floater` has `idle`: hollow circle, "No session" in `ink-muted` 13px, Start pill (glyph + "Start", `aria-label="Start focus"`) in Pause's slot, Open Orasenda; group label "Floating timer, No session"; context menu offers "Start focus" while idle or ended. Drawn at 280 × 64 in both themes (Floating board, row 3). `ended` keeps "Session ended." as `role="status"`. |
| a-timer-2 | Fixed | Props `w` min 280; Changes row "floater-width / -height: default 280 × 64; min 280 × 56; max 360 × 96"; Start pill `padding-inline: space-3`. Re-estimate with the real token values (`icon-md` 14, `space-1-5` 6, pill border 2): ended 12 + 14 + 4 + 4 + ~91 + 4 + ~88 + 4 + 44 + 8 ≈ 273 of 280; Deep Block "1:30:00" at 28px mono 12 + 14 + 6 + ~118 + 4 + 44 + 4 + 44 + 8 ≈ 254. Both drawn at 280 × 56 and in the layout test. |
| a-timer-3 | Fixed | Running popover: heading "Classic · 25 / 5", second line "Presets can change between sessions.", radios `aria-disabled="true"` with `sp-pop-locked` (ink-muted text, dashed rings; the checked one solid in ink-muted), Settings row live. States cell 13, PopoverMenu change row. Contrast: ink-muted on surface-overlay 5.91 / 6.19; on the selection row 4.91 / 5.53; dashed line-strong rings on overlay 4.79 / 4.58. |
| a-timer-4 | Fixed | Status-lines rule: store error, newest milestone, then tips; "Session ended." always wins; a tip waits for an idle Today with an empty row. States captions 6 and 11. Tip markup: visible glyph text `aria-hidden`, sibling `os-sr-only` "Control-Option-F starts or pauses focus from anywhere."; Keys VoiceOver table has the row. |
| a-timer-5 | Fixed | Paused summary "Classic · 25 min" / narrow "25 min", label "Preset Classic, 25 minutes, paused. Preset details"; chip the only "Paused", digits the only time left. Main must-fix 2 and graft 2, One-state-word rule updated. |
| a-timer-6 | Fixed | Strip and stacked strip, idle: the summary drops the length ("Classic · ends 15:20", narrow "ends 15:20"); the digits carry "25 min". Accessible name whole. Sizes captions updated. |
| a-timer-7 | Fixed | `FullFocus` `menu="preset"`: "Preset for the next session" / "Choosing one applies it and closes.", four radios, no Settings row; idle only (`menuPreset: !active && …`). Full-screen cell 9 and keyboard panel: Esc closes the popover without asking to leave; P does nothing while running. |
| a-timer-8 | Fixed | `aria-keyshortcuts="Space"` is gone from Pause and Resume on Today, the Focus window and the floater; kept on Start (Today, Focus, floater). Caveat in the Keys table, the Full-screen and Floating keyboard notes, and the Single-key-shortcuts rule; Keys caption 2 names the End case. |
| a-timer-9 | Fixed, with one leftover | Warning header "Almost up · 2 minutes left · ends 15:20" at 01:48; the ceil rule is in the lede, the caption and the MenuBarTimer row. See a-timer-13: the running and paused headers were not updated to the same rule. |
| a-timer-10 | Fixed | Rail: current page `tabindex="0"`, others `-1`, `aria-current="page"`; Keys caption 1 ("one tab stop with roving focus"), VoiceOver table Rail row, NavRail change row. |
| a-timer-11 | Fixed | Today state `unavailable`: "Timer unavailable. Restart Orasenda to try again." (neutral, no shape), idle ring, Start and Just 2 minutes `aria-disabled="true"`. The design system's disabled look is `surface-sunken` + `ink-muted` + dashed `line-strong` border, so the guard is shape and colour (bundle.css `.os-btn[aria-disabled="true"]`). Contrast ink-muted on surface-sunken 4.82 / 7.94. States cell 14; the Calls list carries the spec A amendment. |
| a-timer-12 | Addressed on canvas, owed in code | The Sizes board now states the full Playwright WebKit test (fonts, 13 sizes, every state, the four assertions) and that nothing in design/system or code changes before it passes. The canvas type cannot render, so this is the right closure here; the finding stays open until the test lands with the first code change (step 3 of "What must happen next"). |

Board layout: every frame in `canvas.json` keeps 80px between columns and 120px between rows after the resizes (States 4000, Sizes 2950, Full screen 2980, Floating 1700, Keys 2500, Contrast 2100, Main 1900); checked arithmetically.

## Contrast re-run (script, tokens.json; ratios light / dark)

| Pair | Role | Light | Dark | Pass |
|---|---|---|---|---|
| ink-muted on surface-raised ("No session" in the floater) | text | 5.91 | 6.75 | yes |
| ink-muted on surface-overlay (popover second line, locked rows) | text | 5.91 | 6.19 | yes |
| ink-muted on selection (locked current row) | text | 4.91 | 5.53 | yes |
| ink-muted on surface-sunken (guarded Start and Just 2 minutes) | text | 4.82 | 7.94 | yes |
| line-strong on surface-overlay (dashed locked rings) | mark | 4.79 | 4.58 | yes |
| line-strong on surface-raised (floater edge, Start pill not applicable) | mark | 4.79 | 4.99 | yes |
| focus on surface-overlay (checked radio in the Focus-window popover) | mark | 5.85 | 7.20 | yes |
| surface-raised on mid-grey #808080 (floater fill) | mark | 3.89 | 4.01 | yes |
| line-strong on mid-grey #808080 (floater edge) | decorative | 1.23 | 1.25 | fails, carried by the fill |
| floater fill / edge on a light wallpaper #EDEDED | mark | 1.15 / **4.15** | **13.52** / 2.71 | yes: one of the two holds in each theme |
| floater fill / edge on a dark wallpaper #1C1C1E | mark | **16.75** / 3.50 | 1.08 / **5.37** | yes: one of the two holds in each theme |

In all six theme × wallpaper combinations at least one of the floater's fill or edge holds 3:1, so the boundary stands. The Contrast board's sentence "on a light desktop the line-strong edge holds about the same ratio as on surface-raised" is true for the light theme (4.15) and not for the dark theme (2.71, where the fill carries it at 13.52); see a-timer-15.

## Remaining findings

### a-timer-13 (minor) The running and paused menu headers do not follow the new ceil rule
**Where:** `MenuBar.dc.html`: "Focus · 18 minutes left · ends 15:20" (two cells) and "Paused · 18 minutes left" while the title reads 18:42; lede and caption: "Header minutes are ceil(remaining)".
**Finding:** Under the rule the canvas now states, 18:42 reads "19 minutes left". The warning cell was corrected (01:48 → 2 minutes) but the three other headers still floor, so the rule and the drawing disagree on the same board.
**Fix:** Change the three headers to "19 minutes left". Add the 18:42 → "19 minutes left" example to the MenuBarTimer README rule beside 01:48 → "2 minutes left", so the implementer has a non-edge case.

### a-timer-15 (minor) The Contrast board overstates the floater edge on a light desktop
**Where:** `Contrast.dc.html`, row "surface-raised on a mid-grey desktop", "Used for" text.
**Finding:** The dark-theme floater's line-strong edge is 2.71 on a light wallpaper; the fill (13.52) is what holds there. The conclusion is right, the reason given is not.
**Fix:** Replace the sentence with the six numbers above and the rule "in every theme × wallpaper combination at least one of fill or edge holds 3:1". Add those three wallpapers to `contrast.py` as the designer asked.

### a-timer-12 (carried) Real-font measurement
Unchanged from round 1: the layout test gates the first code PR.

## Calls I accept as made in round 2

- Floater minimum raised to 280 × 56 rather than a width-dependent ended state: one fewer rule.
- The read-only running popover (no mid-session preset change) with honest copy.
- The Focus-window popover without the Settings row; P inert while running.
- The tip waits for an empty idle row, in practice the next launch.
- "Default preset" error state stays out (no spec copy).
- The two failing contrast pairs reclassified as decorative, with the boundary carried by the fill or the edge as the wallpaper dictates.

## Next

Step 2 of round 1's "What must happen next" can start: the design-system artifact changes (tokens, IconButton + Tooltip, StatusRow, TimerStrip, FloatingTimer, PopoverMenu, the component and README changes), then `design/system/`, then code behind the layout test. Fix a-timer-13 and a-timer-15 on the canvas in passing; neither changes a design-system entry except the one added example in the MenuBarTimer rule.
