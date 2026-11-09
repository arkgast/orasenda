# Orasenda design pass, phase 3 review: Planning screens

- Date: 2026-11-09
- Reviewer: senior product design reviewer (fable)
- Canvas: https://claude.ai/artifact/Jjch1S2VvvL1bGKUoHJERp ("Orasenda — Planning screens"), read as files: `canvas.json`, `Main`, `Keyboard`, `Proposals`, `Board`, `Board-Sizes`, `Calendar`, `Calendar-Sizes`, `Routines`, `Routines-Sizes`, `Review`, `Review-Sizes`, `Overlays`, `Capture`, `Palette`, `planning.css`, `still-point.css`, `orasenda-tokens.css`. Nothing was rendered; layout numbers below are computed from the CSS and the `renderVals()` arithmetic.
- Checked against: SPEC §1 and §2.5, the brief (`01-brief.md` §2–3, §6), the critique (`02-brief-critique.md`), the Today pick (`03-direction-pick.md`: grafts and must-fix list), the design-system README and the KanbanColumn, TaskCard, TimeBlock, HabitDots, CapturePad and CommandPalette READMEs, spec A's copy, and the owner's principles and direction.
- Contrast: every pair by script (`contrast.py`), both themes; table in §3.

## Verdict: approve with changes

The canvas does what phase 3 asked. Every planning page shares one frame (header 44 with the primary at its end, reserved status row 44, one region that scrolls inside itself, a 52px footer only in step flows), so the known issue cannot recur: 16+44+8+44+8+104+16 = 240 and 24+44+8+44+8+440+32 = 600 both check, and the flow variant at 240 tall (16+44+8+96+8+52+16) checks too. Each page has exactly one primary and names it honestly; ⌘↩ starts focus from every page and ⌘K's first result is the start command, so the one-keystroke rule holds everywhere outside Today. The Board never scrolls sideways, Review shows durations in words with no percentages, "missed" or streaks, the capture pad confirms by closing, permissions are asked only from "Show my calendars", nothing uses red, and every icon-only control has a 44px target, a tooltip on hover and focus, a VoiceOver name and `aria-keyshortcuts`. Every color pair the canvas uses passes in both themes.

No finding is a blocker. Five are major: one is a "never by colour alone" miss in Week view, one is a contrast failure in a state the canvas does not draw (the goal tick once the goal is met), two are IA gaps that would otherwise be built twice (pointer selection on Board; the weekly review as both an overview and a flow), and one is undrawn copy in the place where kindness is most at risk (shutdown steps 2–4). The rest is polish.

## 1. Principles and direction, checked

| Check | Result |
|---|---|
| One primary per screen | Holds. Board: Start focus. Calendar: Start focus. Routines: Start routine (Use template when empty; no primary mid-flow; Start focus on the last step). Review: Start shutdown or Start weekly review, never both. Capture: Save to Inbox. ⌘K: no button; first result. Running: SessionSlot replaces the primary everywhere. |
| State never by colour alone | Holds everywhere except the Week view's today column (d-planning-1). Chips, "Selected", "In progress", "Now", strips (name and count), bars (word and value), HabitDots (shape), segmented choice (tick, weight, word) all carry a word or shape. |
| No red; amber = almost up / at limit; critical only destructive | Holds. The only amber is the KanbanColumn "At limit" chip; `critical` appears only in the Delete task Dialog (not drawn, named). Errors are a hollow circle in `ink`. |
| Kind, plain copy | Holds. "ended by you", "rest", "Unfinished is normal.", "That's fine.", "Routine done. Focus is one step away." No exclamation marks or emoji. Two copy nits (d-planning-15, 16). |
| Motion | No new motion; hover and press only. Nothing to remove under reduce-motion beyond the design system's own rules. |
| Contrast 4.5 / 3, focus ring, keyboard | All drawn pairs pass (§3). One undrawn state fails (d-planning-3). Focus ring is the 2px `focus-ring` at 2px offset on every control including the segmented radios via `:has(input:focus-visible)`. Tab order and roving focus are documented per page. |
| Calm by default | Holds. No badges (the Unscheduled count is in the name only), no live app list, no toast on capture, no streak counts. One standing permission card in the tray is a mild ask (d-planning-7). |
| Private by design | Holds. Calendar access asked only from its control, with "reads titles and times, on this Mac only"; usage in Review only says where to turn it on; private apps pooled. |
| Honest friction | Not exercised here (blocking is P6); the canvas says so. |
| Productivity | Strong. Starting is ⌘↩ or one pill on every page; ⌘K then ↩; while running the "Next:" line and status messages clear so nothing asks for a decision. Shutdown presets Tomorrow so Continue alone is enough. Gaps: pointer selection (d-planning-2), compact Calendar navigation (d-planning-8). |
| Owner 1 (configuration elsewhere, small to full window) | Holds; every page drawn at 360×240, 900×600, 1440×900, both themes. |
| Known issue (primary never below the window) | Fixed by construction on every page, including flows at 240 tall. |
| Direction A language | Followed: same status row, IconButton and Tooltip, popover and native-menu model, `still-point.css` reused. SessionSlot is a sound extension (MenuBarTimer plus Pause, inset edge keeps the 44 target). |
| Brief IA deviations | All recorded on the canvas with reasons: no per-card start icon, no horizontal board scroll, block-start prompt in the status row instead of a second button, Week has no tray, compact title becomes a picker. I accept each; see d-planning-2 for the one that needs a complement. |

## 2. Findings

Severity: **blocker** = breaks a principle with no cheap fix; **major** = fix before the design-system changes are made; **minor** = fix in passing.

### d-planning-1 (major) Week view marks today by colour and weight alone

**Where:** `Calendar.dc.html` lines 159–162, `planning.css` `.pl-wd-today`. The day head is `aria-hidden="true"` and renders only `Mon` and `9`; "today" exists only in the lane's `aria-label`. The caption on `Calendar-Sizes` claims "the day name is always a word", but the word that changes is not there; sighted users get a `selection` ground, `focus` text and bold.

**Fix:** Put the word in the head: `Mon 9 · Today` (or a second line "Today" in `body-sm`), keep the ground. Alternatively give the compact NowLine its time word ("10:12") in today's lane. Update the Proposals "NowLine compact" row to say which.

### d-planning-2 (major) Pointer selection on Board is undefined

**Where:** `Board.dc.html` cards are `TaskCard` with `onOpen`; the TaskCard README says `onOpen` makes the card a native button (Enter, Space, click = open). The canvas removes the per-card start icon and makes "selection drives the header Start and ⌘↩". For keyboard users arrow keys select. For a mouse user, a single click opens the editor, so there is no way to select a card without opening it, and the header Start cannot follow the pointer.

**Fix:** TaskCard gains `onSelect` beside `onOpen`: single click or arrow = select (ground + "Selected"), Enter, double-click or the context menu's Open = open. The header's "Next:" line and Start follow the selection. Add this to the dsChanges list (TaskCard) and draw the hover versus selected difference once (hover `surface-sunken`, selected `selection` + word).

### d-planning-3 (major) The goal tick fails contrast once the goal is met

**Where:** `planning.css` `.pl-goal` is 2px `ink` over the bar; `Review.dc.html` line 122 draws it at 86% beside a 69% `focus` fill, so it sits on `surface` (13.23 / 14.54). When the user meets or passes the goal, the tick lands on the `focus` fill: **ink on focus = 2.49 light, 1.66 dark**, both under 3:1. This is the one Review state that should feel good, and the mark disappears.

**Fix:** Draw the tick as a mark outside the track (a 2px `ink` line only in the 4px above and below the bar, or an `ink` triangle under the track pointing up), or give the 2px `ink` tick a 1px `surface` halo. Draw the "goal met" row in both themes and add `ink on focus` to the pairs list as a documented non-pair.

### d-planning-4 (major) The weekly review is both an overview and a primary that starts something undrawn

**Where:** `Review.dc.html` week view already contains the review's work items: the TextArea "One thing to try next week" and the "Plan deep blocks in Calendar" button. The header primary is "Start weekly review", and the report says the weekly review "is drawn as one scrolling page, not as a step flow". So either the primary is redundant (the page is the review) or it starts a flow nobody has drawn, and the same actions would exist in two places.

**Fix:** Pick one and record it. Recommended: the Last week overview is read-only numbers (goal bar, by day, by project, routines, usage line); "Start weekly review" opens the flow with the same footer as the shutdown: look back (the numbers) · one improvement (the TextArea) · plan next week's deep blocks (Calendar week inline, ⌘⇧B to place) · complete. Remove the TextArea and the plan button from the overview. Draw step 1 and the complete state at 900×600 in both themes. Note on the canvas that "top distractions and bypass reasons" (SPEC §2.5) join the flow in P6.

### d-planning-5 (major) Shutdown steps 2–4 are undrawn, and End shutdown's effect is unstated

**Where:** `Review.dc.html` draws step 1 (place what's left) and the complete screen. SPEC §2.5 lists preview tomorrow and the stoic reflection ("what went well, what to improve, what was outside my control"). The reflection is exactly where shaming copy creeps in, and the Keyboard board says "Esc End shutdown (nothing is lost)" without saying whether step 1's moves are applied.

**Fix:** Draw steps 2 and 3 at 900×600 in both themes: step 2 shows tomorrow's Today column and blocks, read-only; step 3 is three optional TextAreas with a "Not now" ghost beside Continue (optional steps always have a visible skip). State the rule: each step's choices apply when Continue is pressed; End shutdown keeps earlier steps and discards the current one; nothing is deleted. Fix the complete screen's step word (see d-planning-11).

### d-planning-6 (minor) "Start routine" uses the play glyph

**Where:** `Routines.dc.html` header primary. The caption says the words are kept "so it can't be confused with Start focus", but the glyph is the same play triangle as every Start focus pill.

**Fix:** No glyph on Start routine (or the routine rounded square). Add a README rule: the play glyph means a focus session starts.

### d-planning-7 (minor) A standing permission card in the tray

**Where:** `Calendar.dc.html` lines 138–151. "See your other calendars here" is shown in every non-denied state, so it stays until the user grants access. The caption says "once".

**Fix:** Add a "Not now" ghost that hides the card; a quiet text button "Show my calendars" stays at the tray's foot so the feature remains one click away. Same for the denied card.

### d-planning-8 (minor) Compact Calendar can only reach three days

**Where:** `Calendar.dc.html` compact select lists Sun, Mon, Tue and "Week of 9 Nov", which the caption says opens Day for the week's first day: a label that does something else. Previous and Next exist only as ⌘[ and ⌘] with no visible control.

**Fix:** The day picker lists the seven days of the current week plus "Today"; drop the Week option in compact. Keep ⌘[ ⌘] and ⌘T.

### d-planning-9 (minor) The default window shows two of five columns

**Where:** `Board.dc.html` `renderVals`: at 900×600, content 772px, `240·t + 64·(5−t) + 48 ≤ 772` gives t = 2, so Today and Doing open at 266px and Inbox is a strip. Triage at the default size costs a click that folds another column.

**Fix:** Test `column-min-width` 200 with `space-2` gaps: 600 + 128 + 32 = 760 ≤ 772, so Today, Doing and Inbox open. Verify TaskCard at 200px with the real fonts (title wraps to two lines; "Est 3 · Done 1 · 0h 25m" is about 150px). If it holds, the token is 200, not 240.

### d-planning-10 (minor) A tooltip is ellipsized

**Where:** `Keyboard.dc.html` lines 92 and 105: "Start focus on Outline… ⌘↩". The tooltip is the visible counterpart of the accessible name and must carry it whole.

**Fix:** Tooltips wrap to at most two lines (`max-width: 40ch`, `white-space: normal`) and never ellipsize. Add to the Tooltip proposal.

### d-planning-11 (minor) Caption and data inconsistencies

- `Main.dc.html` says "one 42px Pause IconButton"; everywhere else it is 44.
- The complete screen's step word is "Done" and the footer button is "Done": the same word twice. Use "All 4 steps done" as on Routines.
- Compact Board selects "Outline workshop slides" while regular selects "Draft chapter 3: the open list"; the Next line and ⌘K use the latter. Use one selection across sizes.
- `Main.dc.html` lists the open-first order as "Today and Doing"; Proposals and the README rule say "Doing, Today, Inbox, Backlog". Keep one order.

### d-planning-12 (minor) Overview steps are checkboxes with no handler

**Where:** `Routines.dc.html` regular and compact overview render `RoutineItem`s without `on-change`. Checking a step outside a running routine is ambiguous.

**Fix:** In the overview, steps are a read-only list (RoutineItem without a handler, or a plain list with the step shape); checkboxes exist only in the running flow. Confirm RoutineItem supports a read-only render in its README.

### d-planning-13 (minor) Strip hover uses the selection ground

**Where:** `planning.css` `.pl-strip:hover { background: var(--selection) }`. The README reserves `selection` for selected and pressed states, with a word; a hovered strip would read as selected.

**Fix:** Hover: chevron and name in `ink`, a 1px `line-strong` edge; pressed: `selection`.

### d-planning-14 (minor) The drawn scrollbar thumb is 4px wide

**Where:** `planning.css` `.pl-scroll::-webkit-scrollbar` 10px with a 3px inset border: the visible thumb is 4px. The point of ScrollRegion is to make "there is more" visible.

**Fix:** Inset 2px (6px thumb) or a 12px bar. Keep `line-strong` (3.90 on `surface-sunken` light, passes).

### d-planning-15 (minor) New copy lives only on the canvas

**Where:** "Orasenda can't load your tasks / this day / your routines / your history right now.", "Your tasks are kept on this Mac. They show here once they load.", "Today folded to make room for Inbox.", "Deep block now: …. Start focus uses it.", "Routine done. Focus is one step away." The Today pick's rule is spec copy only.

**Fix:** Add a copy table to the planning spec (or the design-system README's Voice section) and point each status line at it, so implementation does not re-invent lines.

### d-planning-16 (minor) Capture description assumes a session

**Where:** `Capture.dc.html` "Leave it here. Return to your focus." Capture works at any time.

**Fix:** "Leave it here and go back to what you were doing."

### d-planning-17 (minor) Focus after folding a column is unstated

**Where:** Board "Opening a strip folds the least recently opened column"; the status row says so, but where keyboard focus lands is not written.

**Fix:** Focus moves to the opened column's first card (or its heading when empty); the status line is the announcement. Write it on the Keyboard board.

### d-planning-18 (minor) 11px hour labels

**Where:** `planning.css` `.pl-hour` 11px/14px. Not a design-system size unless it is `caption`.

**Fix:** Use the `caption` type token; if `caption` is larger than 11px, widen `hour-gutter` to fit "09:00".

### d-planning-19 (minor) Shortcut overlaps to document

- ⌘F opens Filter on Board; macOS users expect Find. Acceptable (Filter is a find), but say so in the shortcut table and keep ⌘F free of Find elsewhere.
- Esc is overloaded in flows: tooltip, menu, then End routine or End shutdown. State the precedence (innermost first) on the Keyboard board.

## 3. Contrast, by script (both themes)

Threshold: 4.5 for text, 3.0 for UI marks. Every pair the canvas uses passes; the two failing rows are hairlines the canvas states carry no meaning, and the last row is the undrawn state in d-planning-3.

| Pair | Role | Light | Dark |
|---|---|---|---|
| ink on surface | text | 13.23 | 14.54 |
| ink on surface-raised | text | 14.57 | 13.05 |
| ink on surface-sunken | text | 11.88 | 15.34 |
| ink on surface-overlay | text (tooltips, dialogs, menus) | 14.57 | 11.97 |
| ink on selection | text | 12.11 | 10.69 |
| ink-muted on surface | text | 5.36 | 7.52 |
| ink-muted on surface-raised | text | 5.91 | 6.75 |
| ink-muted on surface-sunken | text (strip counts, empty lines) | 4.82 | 7.94 |
| ink-muted on surface-overlay | text (key caps) | 5.91 | 6.19 |
| ink-muted on selection | text | 4.91 | 5.53 |
| ink-muted on focus-soft | text (deep block times) | 4.91 | 5.53 |
| ink-muted on break-soft | text | 4.97 | 6.05 |
| ink-muted on routine-soft | text | 4.79 | 6.38 |
| ink-muted on amber-soft | text | 5.01 | 5.90 |
| focus on selection | text (segmented on, Selected, current item) | 4.86 | 6.43 |
| focus on surface | text (NowLine, In progress) | 5.31 | 8.74 |
| focus on surface-raised | text (card state) | 5.85 | 7.85 |
| focus on surface-sunken | text / mark | 4.77 | 9.23 |
| focus on focus-soft | text (Deep block title) | 4.86 | 6.43 |
| focus on surface-overlay | text (⌘K Selected) | 5.85 | 7.20 |
| on-focus on focus | text (primary) | 5.94 | 9.23 |
| on-focus on focus-hover | text | 7.60 | 10.59 |
| on-focus on focus-pressed | text | 9.35 | 12.06 |
| break on break-soft | text (Break block) | 5.15 | 7.50 |
| break on surface | mark (half circle) | 5.56 | 9.33 |
| break on surface-raised | mark (done check) | 6.12 | 8.38 |
| routine on routine-soft | text | 5.28 | 7.81 |
| routine on surface | mark | 5.91 | 9.21 |
| amber on amber-soft | text (At limit) | 5.15 | 7.48 |
| amber on surface | mark | 5.51 | 9.53 |
| amber on surface-raised | mark | 6.07 | 8.56 |
| critical on surface | text (Dialog only) | 6.17 | 8.04 |
| on-critical on critical | text (Dialog only) | 6.90 | 8.49 |
| surface on ink | annotation tags only | 13.23 | 14.54 |
| line-strong on surface | mark (edges, scrollbar, bar fill) | 4.35 | 5.56 |
| line-strong on surface-raised | mark | 4.79 | 4.99 |
| line-strong on surface-sunken | mark (scrollbar in wells) | 3.90 | 5.87 |
| line-strong on surface-overlay | mark (tooltip edge) | 4.79 | 4.58 |
| line-strong on selection | mark (selected row edge) | 3.98 | 4.09 |
| line-strong on focus-soft | mark | 3.98 | 4.09 |
| focus-ring on surface | mark | 5.31 | 8.74 |
| focus-ring on surface-raised | mark | 5.85 | 7.85 |
| focus-ring on surface-sunken | mark | 4.77 | 9.23 |
| focus-ring on surface-overlay | mark | 5.85 | 7.20 |
| focus-ring on selection | mark | 4.86 | 6.43 |
| ink on surface (goal tick, goal not met) | mark | 13.23 | 14.54 |
| line on surface | hairline, no meaning (bar track, separators) | 1.46 FAIL (allowed) | 1.45 FAIL (allowed) |
| line on surface-sunken | hairline, no meaning | 1.31 FAIL (allowed) | 1.53 FAIL (allowed) |
| **ink on focus (goal tick, goal met)** | **mark** | **2.49 FAIL** | **1.66 FAIL** |

`--all-text` reports 12 FAIL lines; all twelve are `line-strong` as *text* on tints (3.86–4.47), and the canvas never uses `line-strong` as text, so none applies.

## 4. Carry into implementation

- The Playwright layout test from the Today pick adds Board, Calendar, Routines, Review and ⌘K at 360×240, 900×600 and 1440×900, with the longest status line and an action, asserting the header's primary (or the SessionSlot) is inside the viewport and the page's `scrollHeight <= clientHeight`.
- Verify with real fonts: the compact pickers at 360 wide (Calendar's select gets about 111px; Routines' about 108px) and the 900×600 header with the longest "Next:" task.
- Decided here and to record in the design system: no End control on planning pages (⌘., ⌘K, Today); Start routine without the play glyph; tooltips never ellipsize; TaskCard `onSelect`.

---

# Re-review (scoped): Planning screens, after the designer's fixes

- Date: 2026-11-09
- Reviewer: senior product design reviewer (fable)
- Canvas: https://claude.ai/artifact/Jjch1S2VvvL1bGKUoHJERp, version 1794247356-3d00, read as files: `canvas.json`, `Main`, `Keyboard`, `Proposals`, `Copy`, `Board`, `Board-Sizes`, `Card-States`, `Calendar`, `Calendar-Sizes`, `Routines`, `Routines-Sizes`, `Review`, `Review-Sizes`, `Review-Flows`, `Overlays`, `Capture`, `Palette`, `planning.css`, `still-point.css`, `orasenda-tokens.css`. Nothing rendered; layout numbers from CSS and `renderVals()`.
- Scope: only whether each earlier finding is fixed and whether the fixes broke a principle. Contrast re-run by script for every pair that failed or changed (§3).

## Verdict: approve

All nineteen findings are fixed as reported, and I found no new principle violation in the fixes. Three minor items remain (two stale captions and one sentence missing from the weekly review's step 3); none blocks the design-system changes, and each is a one-line edit the next canvas pass can make.

## 1. Earlier findings, checked

| Id | Status | Evidence |
|---|---|---|
| d-planning-1 | Fixed | `Calendar.dc.html` week head renders `<span class="pl-wd-word">Today</span>` when `d.today`; `.pl-wd-word` is 13/18 600 `focus` on `selection` (4.86 / 6.43). The lane keeps "today" in its `aria-label`. Proposals "NowLine compact" row and the Calendar-Sizes week captions say which. |
| d-planning-2 | Fixed | Every Board TaskCard passes `on-select` beside `on-open`. `Card-States.dc.html` draws rest, hover (`.pl-hoverdemo .os-card` = `surface-sunken`), selected and in progress in both themes. Main, Board-Sizes, Keyboard and Proposals say "a single click or an arrow key selects; Enter, a double-click or Open opens". Added to the dsChanges table and the README rules ("Select is not open"). |
| d-planning-3 | Fixed | `.pl-goal` is a 2px-wide positioned span with `::before`/`::after` 6px `ink` stubs at `top: -8px` and `bottom: -8px`; the fill (`inset-block: -1px`) never reaches them, so the stubs sit on `surface` (13.23 / 14.54). State `week-met` ("12h 30m", fill 89 %, "You reached your 12h goal.", "Goal 12h, reached") is drawn at 900×600 in both themes on Review-Flows. `ink on focus` is in the documented non-pairs table. |
| d-planning-4 | Fixed | Last week overview is read-only (goal bar, by day, by project, HabitDots, usage line, one sentence on what the review does). TextArea and "Plan deep blocks" are gone. States `wk1`, `wk2`, `wkdone` are drawn in both themes; step 3 refers to the Calendar week view; the P6 note on distractions and bypass reasons is on Review-Flows. See d-planning-21 for the one sentence step 3 still needs. |
| d-planning-5 | Fixed | `shut2` (tomorrow's Today rows and blocks as `div[role=listitem].pl-trow-ro`, shape plus type word, no tab stops) and `shut3` (three optional TextAreas, "Not now" ghost beside Continue) are drawn at 900×600 both themes, plus `shut2` at 360×240. The keep/discard rule is written on Review-Flows, Keyboard and Proposals. The questions are "What went well today?", "What was outside your control?", "What will you start with tomorrow?": no blame, no "what went wrong". |
| d-planning-6 | Fixed | Routines header primary is `{{primaryWord}}` with no SVG; Review's primaries likewise. Only Start focus (header pill, compact Start, the routine's last-step footer button) carries the play path. Rule on Main, Proposals (README rules) and the Routines-Sizes caption. |
| d-planning-7 | Fixed | Both tray cards have a "Not now" ghost; state `dismissed` shows a ghost "Show my calendars" at the tray's foot (`margin-top: auto`) with `fr.perm` focus; drawn at 900×600 on Calendar-Sizes with the focus-move sentence. |
| d-planning-8 | Fixed | Compact Day select lists "Today" then Mon 9 to Sun 15 Nov; no Week option in compact; ⌘[ ⌘] ⌘T named in the caption and in the Pages menu ("Go to today ⌘T"). See d-planning-22 for a small redundancy this introduced. |
| d-planning-9 | Fixed | `.pl-cols .os-kanban { flex: 1 1 200px; min-width: 200px }`, `gap: space-2`; `renderVals` uses `200t + 64(5−t) + 32 ≤ contentW`, giving three open columns at 900×600 (760 ≤ 772). Token row says 200 and asks for the real-font check. The fold demo is "Backlog opened" with "Inbox folded to make room for Backlog." (copy B2). |
| d-planning-10 | Fixed | `planning.css` `.sp-tip { white-space: normal; width: max-content; max-width: 40ch }`, `.sp-tip .sp-kbd { white-space: nowrap }`. Keyboard specimens show "Start focus on Draft chapter 3: the open list ⌘↩" in full, both themes. Tooltip proposal row and the Keyboard caption say "never ellipsize". |
| d-planning-11 | Fixed | Main: "one 44px Pause IconButton". Step word "All 4 steps done" for both flows (`stepWord`). One selection, "Draft chapter 3: the open list", in compact row, Start label, tooltip, VoiceOver table, Next line and ⌘K. Main's fold order reads "Doing, Today, Inbox, Backlog". |
| d-planning-12 | Fixed | Regular and compact overviews use `<ol class="pl-steplist">` with the hollow rounded-square routine shape, no inputs, no tab stops. RoutineItem with `on-change` appears only in the running flow. "RoutineItem read-only" is in dsChanges; the Keyboard tab order says "no tab stops". |
| d-planning-13 | Fixed | `.pl-strip:hover` is `box-shadow: inset 0 0 0 1px line-strong` with chevron and count in `ink`; `:active` is `selection`. Drawn hovered (`pl-hovered`) on the dark 900×600 Board. |
| d-planning-14 | Fixed | Thumb border 2px on a 10px bar: 6px visible thumb, `line-strong`. Proposals ScrollRegion row and the `scrollbar-size` token row updated. |
| d-planning-15 | Fixed | `Copy.dc.html` lists B1–B4, C1–C5, R1–R3, V1–V3, S1–S4, W1–W2, K1–K4, P1 and the load-error pattern; captions cite ids (C1, S2, B2, R1); README Voice rule proposed. Repo spec untouched, as the pass requires. |
| d-planning-16 | Fixed | Capture description: "Leave it here and go back to what you were doing." (K1). |
| d-planning-17 | Fixed | Keyboard Board row and Board-Sizes "Backlog opened" caption state focus moves to the opened column's first card (its heading when empty); `pl-focusfirst` draws the ring on Backlog's first card; the status row is the announcement. |
| d-planning-18 | Fixed | `caption` in tokens.json is 11/14/500; `.pl-hour` matches it and the `hour-gutter` token row names the token. 52px gutter unchanged. |
| d-planning-19 | Fixed | Shortcut table: ⌘F is Filter on Board only and "stays free of any other meaning on every other page". New "Esc precedence: innermost first" panel (tooltip, menu/select/popover, dialog, flow; never stops a session; one press does one thing). |

Principles after the fixes: still one primary per page (the flows' footer Continue is the only primary mid-flow; "Not now" and End are ghosts); nothing new is by colour alone (the Today word, "Selected", stub plus "Goal 12h" word, read-only rows with shape plus type word); no red; copy stays plain and without exclamation marks ("You reached your 12h goal." is the celebratory line, and it is a full stop); no new motion; no new permission prompt; tooltips still carry the whole name. The 240-tall frame arithmetic is unchanged.

## 2. Remaining findings

### d-planning-20 (minor) Stale column width in the 900×600 Board caption

**Where:** `Board-Sizes.dc.html` line 35: "Today, Doing and Inbox at about 252px each". With three open columns, two strips and four `space-2` gaps, the open columns share 772 − 128 − 32 = 612px, so about 204px each, which is also why the real-font check at 200px matters.

**Fix:** "at about 204px each".

### d-planning-21 (minor) Weekly review step 3 has no task source

**Where:** `Review-Flows.dc.html` "How a step flow keeps or drops what you chose": step 3 is "place this week's deep blocks (Calendar's week view inline; ⌘⇧B places the selected task in the next free deep slot)". By the canvas's own rule, Week has no tray ("Week is for shape, Day is for placing"), so inside the flow there is nothing to select and nothing to place. Left as is, implementation would invent the list.

**Fix:** One sentence on Review-Flows and the Keyboard board, no new drawing needed: step 3 shows the week lanes with the Unscheduled tray beside them, filtered to Deep tasks from Today, Inbox and Backlog (TaskRow density), and ⌘⇧B or a drag places the focused row in the next free deep slot; or, if the tray must stay out of Week, step 3 walks the five weekdays in Day view with the tray. Pick one and record it.

### d-planning-22 (minor) Two options for the same day in the compact Day picker

**Where:** `Calendar.dc.html` compact `<select aria-label="Day">`: "Today" and "Mon 9 Nov, today" both name 9 November. A value select with a command-like first option means choosing "Today" would snap the control to a different option, and VoiceOver reads two entries for one day. (This follows my own d-planning-8 wording; the redundancy is mine.)

**Fix:** Drop the "Today" option while the listed week contains today (the ", today" suffix, ⌘T and the Pages menu's "Go to today" remain); show "Today" as the first option only when the week shown does not contain it.

## 3. Contrast, re-run by script (both themes)

Pairs that failed before or that the fixes changed. Threshold 4.5 text, 3.0 UI mark.

| Pair | Role | Light | Dark |
|---|---|---|---|
| focus on selection | text: week head "Today" (new) | 4.86 | 6.43 |
| ink on surface | mark: goal stubs (moved off the fill) | 13.23 | 14.54 |
| ink on surface-sunken | text: hovered strip chevron and count (new) | 11.88 | 15.34 |
| line-strong on surface-sunken | mark: strip hover edge, scrollbar thumb in wells (new/changed) | 3.90 | 5.87 |
| line-strong on surface | mark: 6px scrollbar thumb | 4.35 | 5.56 |
| line-strong on selection | mark: pressed strip edge | 3.98 | 4.09 |
| focus on surface | mark: deep shape in read-only rows (new) | 5.31 | 8.74 |
| routine on surface | mark: routine shape in read-only step lists (new) | 5.91 | 9.21 |
| ink-muted on surface | mark/text: shallow shape, "Optional." helpers (new) | 5.36 | 7.52 |
| ink-muted on selection | text | 4.91 | 5.53 |
| ink-muted on surface-sunken | text: strip counts | 4.82 | 7.94 |
| ink on focus | former goal tick; no longer drawn, documented non-pair | 2.49 FAIL (not used) | 1.66 FAIL (not used) |
| line on surface | hairline, no meaning (bar tracks, dividers, hour rules) | 1.46 FAIL (allowed) | 1.45 FAIL (allowed) |

Every pair the canvas now draws with meaning passes in both themes.

## 4. Carry into implementation (additions)

- Verify in a render: a hovered TaskCard takes `surface-sunken`, which is also the column well's ground, so the hovered card reads as "pressed into" the well with only its `line-strong` edge. If that reads as disabled rather than hovered, use `surface` with the edge instead; the design system's TaskCard README defines no hover yet, so this is the moment to fix it there.
- The real-font check for TaskCard at 200px (d-planning-9) still needs a WebKit render before `column-min-width` lands.
- d-planning-21's sentence should be written before the weekly review flow is specced for implementation.
