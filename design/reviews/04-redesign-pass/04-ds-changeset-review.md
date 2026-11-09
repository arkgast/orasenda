# Review of the consolidated design-system changeset (`04-ds-changeset.md`)

- Date: 2026-11-09
- Reviewer: senior product design reviewer (fable)
- Inputs: `04-ds-changeset.md`; `04-groups.json` (all five groups: dsChanges, calls, notCovered, remaining); `03-direction-pick.md`; `review-*.md` outcomes; repo `design/system/` at `main` 04d8c3a (README, tokens.json, the 18 component READMEs the changeset touches); `docs/specs/2026-11-08-focus-session-loop.md` (spec A) for every status line; `docs/SPEC.md` for the two-minute rule.
- Contrast: re-run by script. `contrast.py` against the repo tokens for every pair in sections 9.1, 9.2 and 9.4 plus the pairs the changeset relies on that `04-contrast-run.txt` lacked (`focus-ring` on `surface` and `surface-raised`, `surface-sunken` on `surface-overlay`, `line-strong` on `amber-soft`, `amber` on `surface-sunken` and `selection`); `contrast_tmp.py 04-tokens-tmp.json` for the six theme × wallpaper combinations. Every number in section 9 reproduces to two decimals. New results: `focus-ring on surface` 5.31 / 8.74, `focus-ring on surface-raised` 5.85 / 7.85, `line-strong on amber-soft` 4.06 / 4.36 (3:1 mark, passes), `surface-sunken on surface-overlay` 1.23 / 1.28 (the PopoverMenu hover ground: a non-pair like the others in 9.4; add it there). No relied-on pair fails.

## Verdict

**Approve with changes.** The reconciliation is sound: the 24 conflicts are each decided for a stated reason, the counts in section 0 are right (24 + 1 + 1 new tokens, 20 changed, 17 + 17 components, 34 rules, 12 rejections), every group's `remaining` finding is either absorbed (a-timer-13, a-timer-15, b-settings-12, c-tracking-19, N1, N2, d-planning-22, e-onboarding-14) or routed (c-tracking-18, d-planning-21, b-settings-11 is missing; see cs-6), and the "Just 2 minutes" purpose paragraph in 6.2 is the right answer to the owner's question and belongs in the StartButton README as written. What follows are four internal contradictions an implementer could not resolve alone, and fifteen smaller fixes. None needs a new drawing.

## Findings

Severity: **major** means two parts of the changeset (or the changeset and a rule it writes) say different things; **minor** means a gap, a wording or a routing fix.

### cs-1 (major) FullScreenFocus caption promises a single key that a setting can turn off
6.3 adds the caption "Space pauses · Esc leaves", and graft 4 / 5.2 give the preset summary the tooltip "Change preset · P". Rule 14 (from b-settings-7) says "copy never promises a single key a setting can turn off", and Space and P are exactly those keys.
**Fix:** the caption reads "Space pauses · Esc leaves" only while Single-key shortcuts is on; off, it reads "Esc leaves" (or "⌘. ends · Esc leaves"). Tooltips and tips drop their Kbd when the setting is off (the control stays reachable by Tab, which rule 14 already requires). Write this in 5.2 Tooltip, 6.3 and rule 14.

### cs-2 (major) The floater is both a strip layout and a MenuBarTimer composition
`layout-strip-height` (3.1), TimerStrip's purpose (5.4) and rule 1 (7.1) say "Today, the Focus window and the floater" use the strip layout; every floater size (280×56 to 360×96) is wider than twice its height and under 420 tall, so by that rule the floater would always be a TimerStrip. 5.5 FloatingTimer says it is MenuBarTimer `compact: false` plus two IconButtons, which is what the a-timer canvas drew and the reviewer approved.
**Fix:** remove "and the floater" from `layout-strip-height`, 5.4 and rule 1: the strip rule applies to Today and the Focus window; the floater is its own composition sized by the `floater-*` tokens and never changes layout by shape. Keep `timer-md` as "digits in the floating timer and the floor for the strip's digits".

### cs-3 (major) RoleTag Neutral uses the hollow circle, a reserved mode shape
5.15 lists "Neutral = hollow circle". Rule 11 (conflict 11, from c) says the hollow circle means modes only (shallow, paused, idle), and RoleTag's own Don't names Focus as the single deliberate reuse.
**Fix:** either give Neutral a non-mode glyph (an outlined circle with a short horizontal bar, 14px, 1.5 stroke, reads as "no role") and update the role glyph family in rule 11 and 5.15, or write the exception the way Focus is written ("Neutral reuses the hollow circle because it means no hue, as Shallow does"). Pick one; the first keeps rule 11 clean.

### cs-4 (major) AppRow's "key M" contradicts "no single-key shortcuts on Settings"
5.14 gives the role IconButton "key M". Apps and sites is a Settings section (conflict 4), and rule 14 / conflict 24 say single-key shortcuts "never exist on Settings or any page with text fields". The two sentences cannot both ship.
**Fix:** drop M. The list is one roving tab stop and the IconButton is one Tab from the focused row, so nothing is lost. If a letter key on a focused row is wanted later, rule 14 must first say "a list may act on a letter key only while one of its rows has focus, as native lists do", and name it. Also fix 5.1: `aria-haspopup` applies "when it opens a menu, native or PopoverMenu", not only a native one.

### cs-5 (minor) Tooltips inside modal dialogs cannot rely on `z-popover`
AppPicker (5.16) and the compact CommandPalette (6.15) have a Close IconButton with a Tooltip; FullScreenFocus's Leave IconButton opens a Dialog. Native `showModal()` puts the dialog in the top layer, which no z-index reaches, so a tooltip portalled to `body` is hidden behind it.
**Fix:** 5.2 Tooltip: "renders inside the nearest open dialog when its trigger is in one; `z-popover` applies only outside the top layer". One sentence.

### cs-6 (minor) Section 10 misses spec A contract changes the canvases made
Spec A's Today contract (line ~220) says the running finish line reads "Realistic finish · 15:20" beside the chip, the preset is a native radio group on Today, and the standing store line has **no action**; its UI tests assert the "Realistic finish" wording. The changeset replaces all three (preset summary "Classic · ends 15:20", PopoverMenu, a "Try again" on the store line) but section 10 lists only the Custom-range refusal and the e-onboarding amendment. b-settings-11 (About row while the store cannot be read: "Orasenda can't read your sessions right now.") is also missing from 8.3.
**Fix:** add the three contract changes to section 10. For Today's store line, drop "Try again": the scheduler already retries the owed write once a second (spec A, Unsaved writes), so the button would do what happens anyway. Keep "Try again" on Settings, where no automatic retry exists. Add the b-settings-11 About line to 8.3 under Store unavailable.

### cs-7 (minor) `verification/contrast.py` does not exist in the repo
Rule 6 (7.2) and section 10 say it "gains" wallpaper fixtures; `03-direction-pick.md` says to run it. The only script is `design-pass/contrast.py` in the scratchpad.
**Fix:** section 10: "Add `verification/contrast.py` (from `design-pass/contrast.py`) with the three wallpaper fixtures and the pairs in section 9, and call it from `./scripts/ci.sh`." Rule 6 then names a file that exists.

### cs-8 (minor) Save-line copy breaks the row's own two-sentence limit, and joined tones are undefined
8.1 says the row holds at most two sentences; 8.3 Write failed puts "Break minutes weren't saved. Orasenda can't write its data file. Back to 10." (three) plus Try again in the status row. 8.1 item 3 joins a milestone and a store line but does not say which tone the row takes when they differ (warning "Two minutes left…" cannot join, it is cleared at the end, but "Session ended." neutral + store attention can).
**Fix:** status row "Break minutes weren't saved. Back to 10." + Try again; the reason sentence stays beside the field. Add to 8.1: "a joined row takes the tone and glyph of its first sentence". 

### cs-9 (minor) "Beside a 44px action" measures height, not width
8.2's footnote and rule 2 say every message fits two lines at 360 wide "beside a 44px action". The actions are text ghosts: "Open Settings" is about 110px, "Try again" about 80, "Got it" about 60. The longest refusal (56 characters) beside "Open Settings" at 360 wide leaves about 210px, roughly 32 characters a line, which fits only because the chip is out of the row while idle.
**Fix:** write "beside the widest action, 'Open Settings'" and add the stacked-strip running case (chip + two-line store line + no action) to the layout test list.

### cs-10 (minor) PageFrame's flow variant at 360×240 with a status line leaves a 44px region
List variant: 240 − 44 − 44 − 32 (space-4 ×2) − 16 (two space-2 gaps) = 104 ≥ 96, as 3.2 claims. Flow variant with a line showing (conflict 21): 240 − 44 − 44 − 52 − 32 − 24 = 44px, one row. PageFrame (5.9) also never names its row gap.
**Fix:** 5.9 anatomy: "rows `space-2` apart". State the floor honestly: "a flow's region is at least 44px at the minimum while a status line shows; the pick's fallback (minimum height 280) applies if the layout test shows a step unusable there".

### cs-11 (minor) Select differs from Input in ground and weight while "in the Input family"
5.7: `surface-raised`, weight 600. Input README: ground `surface-sunken`, body 400. A value Select ("Add as", "Keep usage for") at 600 reads like a title.
**Fix:** value selects use `surface-sunken` and weight 400 like Input; weight 600 only for the `labelHidden` compact page picker, whose value is the title. Chevron `ink-muted` on `surface-sunken` is 4.82 / 7.94 (passes).

### cs-12 (minor) AppPicker's search field has an sr-only label against Input's own rule
5.16 gives the search Input an sr-only "Search apps"; Input README says "`label` is always visible", and rule 17 allows one exception only for the compact page picker.
**Fix:** add `labelHidden` to Input (6.7) with one named exception: a `type="search"` field inside a dialog whose title names what is searched. Or show the label; the picker header has room.

### cs-13 (minor) "A visually hidden h1" in regular PageFrame
5.9 says a visually hidden `h1` receives focus on arrival, but in regular the header shows the title, which should be the `h1`. Rule 20 already says "(possibly hidden)".
**Fix:** "the title is the `h1`; when a compact picker replaces it, the `h1` is visually hidden. Either way it receives focus on arrival."

### cs-14 (minor) Esc precedence omits two Esc behaviours the changeset defines
Rule 18 lists tooltip, menu/select/popover, dialog, step flow. 5.13 gives the ShortcutRecorder "Esc cancels" recording; rule 25 gives fields "Esc restores the saved value".
**Fix:** rule 18: "tooltip, then a recording shortcut field or an edited field (restores the saved value), then menu, select or popover, then dialog, then a step flow."

### cs-15 (minor) Conflict 9's reason contradicts the paused strip fill
Conflict 9 rejects `ink-muted` as a bar fill because "`ink-muted` is a text token", yet 5.4 and 9.2 use `ink-muted` as the paused strip fill, and the existing TimerRing already freezes its arc in `ink-muted`.
**Fix:** reason: "`line-strong` is the neutral mark; `ink-muted` as a mark means paused or shallow, and bars are neither". Add "the paused arc and strip fill" to `ink-muted`'s usage text in 3.2.

### cs-16 (minor) Scrollbar thumb minimum height changed without a recorded conflict
b proposed a thumb "at least `hit-min` tall"; 3.1 and 5.8 say `hit-floor`. Conflict 1 records only the width.
**Fix:** add to conflict 1: "thumb at least `hit-floor` tall, not `hit-min`: it is not a required target because the keyboard scrolls the region". `hit-floor` also sizes the aria-hidden "More below" row, which is not a target; its usage text in 3.2 should say "also the height of the 'More below' row (not a target)".

### cs-17 (minor) BarRow goal scaling and `body-sm` usage text
5.17 scales fills "to the largest value in the list"; the goal variant must scale to the goal and say what happens past it. Separately, 6.6 sets the status-row message in `body-sm` `ink`, but `body-sm`'s usage text (unchanged in 3.2) says `ink-muted`.
**Fix:** 5.17: "the goal bar scales to the goal; a value past the goal fills the whole track and the words carry it ('Goal 12h, reached')". 3.2: `body-sm` usage "ink or ink-muted on every surface and soft tint".

### cs-18 (minor) `kbd` type style sits in the "Timer" group
3.1 puts `kbd` (12/16/400 mono) in the Timer group, so the group name stops describing its members, and the README Type paragraph ("every countdown, clock and duration is mono") would need a clause for key caps.
**Fix:** rename the group "Mono" (family unchanged), or add a one-line "Keys" group. Add "key caps (`kbd`)" to the README Type paragraph.

### cs-19 (minor) Layout-test size list is narrower than the a-timer canvas's
Rule 2 lists 360×240, 360×360, 640×480, 900×240, 900×600, 1440×900. The approved a-timer test also has 640×330 (the one size that exercises "strip from `layout-compact-width` under `layout-ring-min-height`"), 3440×400, the Focus window at 1280×720 and 1920×1080, and the floater at 280×56, 280×64 and 360×96 in every state.
**Fix:** list them in rule 2, or point rule 2 at the a-timer Sizes board as the source and keep the README list short with "at least".

## What I checked and found consistent

- Threshold arithmetic: 360×240 → stacked strip; 640×330 → strip; 900×240 → strip; `layout-ring-min-height` 360 ≥ 188 + 160; `floater-max-height` 96 with the state word from 88 = 2 × `hit-min`; `column-min-width` 200 × 3 + 64 × 2 + 8 × 4 = 760 ≤ 772; `hour-gutter` 52 ≥ about 40px for "09:00" at 13px mono; `minute-scale` 2px gives 30px for 15 minutes ≥ `hit-floor`.
- Conflicts 1 to 24 each pick a side with a reason, and the picks agree with `03-direction-pick.md` (grafts 1 to 6, must-fix 1 to 10): `duration-slow` 1600ms, "Classic · 18 min left" never "Paused · …", spec copy only, hidden `h1`, one menu model, window tokens, contrast pass, icons as placeholders, layout test.
- Status-row copy in 8.2 matches spec A word for word where spec A has a line ("Session ended.", "Your last session ended while Orasenda was closed.", "Orasenda can't save sessions right now.", "This data was saved by a newer Orasenda.") and follows the Voice rules elsewhere: no exclamation marks, no shaming, contractions in Orasenda's voice.
- Principles: one primary per screen holds on every page (Settings has none and says so; planning pages put theirs at the header's end; the SessionSlot replaces it); no state by colour alone (every tone has a word, and the strip's amber fill carries a triangle); no red for time (amber only with the triangle and a word; `critical` only in the destructive Dialog); motion only `duration-calm` and `duration-slow` on `easing-calm`, instant under reduced motion; disabled always with a visible reason.
- The "Just 2 minutes" paragraph (6.2) is faithful to `docs/SPEC.md` line 39 (the 2-minute rule lowers the cost of starting) and answers the owner's question plainly; keep it as the README's purpose sentence.

---

# Scoped check of the republished design system (artifact version 1794260898-f16f)

- Date: 2026-11-09, 17:50
- Reviewer: senior product design reviewer (fable)
- Method: Artifact tool `read` of every path in the task list plus `bundle.js` and the 29 files the changeset does not touch; byte comparison against `design/system/` at `main` 04d8c3a (the "before" state); name-keyed diff of `tokens.json`; `contrast.py` re-pointed at the live `tokens.json` for every pair in changeset sections 9.1, 9.2 and 9.4 and the five pairs the first review added; `contrast_tmp.py` for the six theme × wallpaper combinations.

## Verdict

**Approve with changes.** Every item in the changeset is applied, nothing outside it changed, every new or changed token has usage text and every new or changed component has a README, the `timer-sm` text is fixed in both the token and the README Type paragraph, both themes are defined, and every relied-on contrast pair reproduces to two decimals. The eight findings below are all minor: previews of changed components that still show the old behaviour, one unrecorded token-text edit, and a few places where a preview or README sentence drifts from a rule the same changeset wrote. None needs a token or a new drawing.

## What was checked and found correct

- **Tokens (3.1, 3.2, 4).** 24 new size tokens, `duration-slow` 1600ms and the `kbd` type style (12/16/400, tracking 0, tabular) are present with the changeset's usage text. The 22 changed tokens match, including `window-min-width` 360px, `window-min-height` 240px, `timer-sm`'s new text ("Not the macOS menu-bar item…"), `caption` ("Hour labels moved to timer-sm"), `body-sm` and `ink-muted` (cs-15, cs-17), `hit-floor` (cs-16). The type group is renamed Mono and holds `kbd`. Colour values are byte-identical to the repo and every colour token has `light` and `dark`. The README Type paragraph reads "Every countdown, clock and duration, and every key cap (`kbd`), is `--font-mono`…" and lists `timer-sm` for small clocks and durations (section 4).
- **New components (5.1–5.17).** All 17 have a README and a static `preview.html`. Each README carries its review fix: Tooltip (cs-1 single keys, cs-5 top layer), FloatingTimer and TimerStrip (cs-2, the floater never uses the strip), RoleTag (cs-3, Neutral is a circle with a horizontal bar; the preview draws it), AppRow (cs-4, no letter key, `aria-haspopup="menu"`), Select (cs-11, `surface-sunken`, weight 400, 600 only for the compact page picker), AppPicker (cs-12, visible "Search apps" label), PageFrame (cs-10 arithmetic, cs-13 heading), BarRow (cs-17 goal scaling), ScrollRegion (cs-16 thumb floor). `index.d.ts` declares the 17 contracts and says they are not in the preview bundle yet; `bundle.js` is unchanged.
- **Changed components (6.1–6.17).** All 17 READMEs carry the changeset text: TimerRing fluid and `duration-slow`; StartButton play glyph, "Just 2 minutes" purpose paragraph, `compactLabel`, `unavailable`; FullScreenFocus IconButton, caption on/off (cs-1), borderless window; MenuBarTimer menu table with ceil minutes and the "Orasenda," prefix; NavRail roving focus and the Pages button; InlineNotice `variant="row"` with the section 8 priority and both slot tables (cs-6 store line without action, cs-8 "Back to 10.", cs-9 widest action); Input alert glyph and no `labelHidden`; Choice segmented and long; EmptyState inline; IntentPrompt variants and `layout-tight-height`; Dialog `safe`; KanbanColumn fold; TaskCard select and row; RoutineItem readOnly; CommandPalette shortcut and compact; CapturePad copy; NowLine compact and "Today".
- **README rules 1–34 (section 7).** All present in the right sections: Layout (1–5), Colour (6, with the wallpaper fixtures and the `verification/contrast.py` note from cs-7), States (7–9), Motion (10), Iconography (11–13), the new Keyboard and menus (14–21, Esc order from cs-14) and Pages and flows (22–29), Voice (30–34). No leftover "scroll below it", "Realistic finish", error triangle or 900×600 minimum.
- **Nothing else changed.** The 29 files outside the list (Button, Cover, HabitDots, ModeChip, TextArea, TimeBlock, Toast, WellnessNote and the untouched previews) are byte-identical to the repo. `bundle.js` is byte-identical. `bundle.css` adds one block at the end (new classes only) and leaves the existing rules untouched. `design-system.json` changes only `lastChange`.
- **Both themes.** The new CSS uses tokens only (no hex, no font name); every colour it references has light and dark values. The bundle hard-codes type sizes that mirror the tokens (as the existing bundle already does, stated in its header comment); the `--type-<name>` shorthand is a repo build item (N2), stated in the README.
- **Contrast (by script, live tokens).** 9.1 and 9.2 reproduce exactly: `focus-ring` on `surface` 5.31 / 8.74 and on `surface-raised` 5.85 / 7.85; `line-strong` on `amber-soft` 4.06 / 4.36 (mark); `amber` on `surface-sunken` 4.95 / 10.06 and on `selection` 5.05 / 7.01; `surface-sunken` on `surface-overlay` 1.23 / 1.28 (hover ground, not relied on, as 9.4 says). Floater fill / edge against light, mid and dark wallpaper: at least one of the two holds 3:1 in every combination, as the FloatingTimer README's table states.

## Findings

### art-1 (minor) Previews of changed components still show the old behaviour
The READMEs for TimerRing, StartButton, FullScreenFocus, MenuBarTimer and CommandPalette changed, but their `preview.html` files are byte-identical to before and `bundle.js` is unchanged, so the gallery contradicts the text: the StartButton preview passes `finishTime: '17:20'` and the bundle renders "Realistic finish · 17:20" under the button with no play glyph (6.2 moves the finish time to the preset summary); the FullScreenFocus preview shows the ghost "Leave full screen" and a fixed 560 ring (6.3 makes it an IconButton and the ring fluid); the MenuBarTimer preview's caption says "the floating mini timer adds the task" (6.4 says `compact: false` is composed by `FloatingTimer`); the CommandPalette preview has no `shortcut`; the TimerRing preview has no fluid case. In a design-first repo the preview is what people look at.
**Fix:** until the bundle is rebuilt, do what the new components do: add a static HTML state below the live one (a Start pill with the play glyph and the preset summary line; an IconButton "Leave full screen" in the top-right; a `shortcut` Kbd on one command), drop `finishTime` from the StartButton preview, and change the MenuBarTimer caption to "Compact in the menu bar and in `SessionSlot`; see `FloatingTimer` for the mini window."

### art-2 (minor) `hit-floor` lost "and the menu-bar timer" without a record
Changeset 3.2 says the `hit-floor` text gains the thumb minimum and the "More below" row; the live text also drops the old "and the menu-bar timer". The drop is right (the menu-bar item is native since #86), but the changeset's row does not say so, so the repo refresh and the changeset disagree on one sentence.
**Fix:** add to 3.2's `hit-floor` row: "drop 'and the menu-bar timer' (native since #86)".

### art-3 (minor) "Built in" reuses the Always-allowed shield
AppRow's preview gives the Orasenda row a `RoleTag` reading "Built in" with the shield glyph, which the RoleTag README defines as Always allowed. Rule 11 says a glyph means one thing, and the README lists no Built-in glyph.
**Fix:** "Built in" is a word-only tag (no glyph), or RoleTag gains a seventh glyph and the README names it. Word-only is enough: the row has no control and the word carries the state.

### art-4 (minor) The PopoverMenu preview mixes two states
The preview's heading is "Preset" with the read-only line "Presets can change between sessions.", yet only Custom is `aria-disabled` and the heading is not "Classic · 25 / 5" as the README's read-only state requires. It is neither the idle menu nor the running one.
**Fix:** show the idle menu (heading "Preset", no second line, every row live, the Settings row) and, if a second state is wanted, a second panel in the read-only form (heading "Classic · 25 / 5", the line, the other radios disabled). If Custom is meant to be disabled because its minutes are out of range, say so in a `meta` ("50 / 10 · out of range").

### art-5 (minor) IconButton says Pause/Resume is `round`; two compositions use `md`
IconButton's Sizes line: "`round` … Pause/Resume uses it so the target is visible". SessionSlot's README specifies a 44 × 44 Pause button and the FloatingTimer preview uses `md` too. Both are right for their size (a 52px round does not fit a 56px floater), but the IconButton sentence reads as a rule.
**Fix:** IconButton Sizes: "`round` is Pause/Resume on Today and in the Focus window; inside `SessionSlot` and `FloatingTimer` the button is `md`."

### art-6 (minor) InlineNotice's first bullet predates the `attention` tone
Line 3 still says "`tone: 'warning'` … everything else is neutral", while the Status row section below defines `neutral`, `attention` and `warning`, and `index.d.ts` types all three.
**Fix:** "everything else is `neutral`, or `attention` in the status row (the alert glyph, section below)".

### art-7 (minor) StartButton's `disabled` is no longer documented but still typed and previewed
The README dropped "`disabled` when no task is chosen" (right: Start needs no task, and rule 7 says nothing is disabled without a reason), but `index.d.ts` keeps `disabled?: boolean` and the Button preview still shows a primary "Choose a task first".
**Fix:** either remove `disabled` from `StartButtonProps` (leaving `loading` and `unavailable`, which both have a visible reason) or document it with the rule-7 line it needs. Rename the Button preview's disabled sample to something that has a reason ("Starting…" already exists; "Nothing to end" is another).

### art-8 (minor) AppPicker's inset focus ring is undocumented
`.os-picker-row:has(:focus-visible)` draws the ring at a −2px offset, while the README's Accessibility line says the focus ring is "a 2px offset … never clipped". The inset is the right call inside a scrolling body (an outward ring would be clipped by the scroll box), but the exception is written nowhere.
**Fix:** AppPicker README, States: "the ring sits inside the row because the result list scrolls; it is the one place the ring is inset."

## Not re-checked here
Spec A and `verification/contrast.py` changes (section 10) live in the repo PR, not the artifact. The layout test (rule 2) gates the first code change and was not run. The repo refresh of `design/system/` has not happened yet; when it does, diff it against this artifact version (1794260898-f16f) rather than the changeset text.
