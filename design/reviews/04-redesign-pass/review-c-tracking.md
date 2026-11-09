# Review C: Tracking, blocking and recent apps

- Date: 2026-11-09
- Reviewer: senior product design reviewer (fable)
- Canvas: https://claude.ai/artifact/66E6UxNb3GqCzopeqGAZad (version 1794246078-f705). Read as files: `canvas.json`, `Main`, `Settings`, `Picker`, `Overlay`, `Usage`, `Apps-Light`, `Apps-Dark`, `Privacy`, `States`, `Picker-Board`, `Overlay-Light`, `Overlay-Dark`, `Usage-Board`, `Controls`, `Proof`, `apps.css`, plus the shared `still-point.css` and `orasenda-tokens.css`.
- Checked against: SPEC §1, §2.6, §2.7, §3; ADR-004, ADR-005; the owner direction (5: tracking and blocking presentation) and decided items; `03-direction-pick.md`; `01-brief.md` §2.1, §3.6–3.9, Q3, Q12–Q15; design-system README, `tokens.json`, the `IntentPrompt`, `Dialog`, `Choice`, `InlineNotice` and `EmptyState` READMEs, `bundle.css`; the spike's `apps/orasenda/src/spike/Overlay.tsx` (for the fallback state).
- Contrast: every pair the canvas uses run through `contrast.py` in both themes (table below).

## Verdict: approve with changes

The model is right and it is better than the brief's. Splitting by question (Apps and sites answers "what happens if I open this during focus", Privacy answers "what does Orasenda keep about me") removes the duplicate row the brief still had, gives each page exactly one primary, and makes the independence of role and privacy visible instead of explained. The role glyph family keeps the mode shapes for modes, every state is a glyph and a word, nothing uses amber or red, and `critical` appears once, on the delete confirm. The pause keeps Back to focus as the only primary at every step and strength, Firm shows a clock time instead of a countdown, Strong lock says it is not a hard lock, and the context line keeps time visible. Usage is reflective only: running and recent apps appear inside Add apps and nowhere else, and the per-session line exists only when recording was on. No macOS permission is asked for tracking or blocking, which matches ADR-004/005, and the only two asks (Login Items helper, browser extension) are drawn at the moment of need. The fixed-track grid and ScrollRegion fix the known issue by construction on every list page: the arithmetic at 360×240 checks (16 + 44 + 8 + 44 + 8 + list + 16; list 104, edge row 24).

Seven majors stand between this and the design-system changes. Two are honesty problems (the Strong lock sentence becomes false once the helper exists; the fallback state names an app the overlay cannot know), one is a privacy-copy contradiction, one drops privacy controls at compact sizes, one makes a blocking rule the user never chose, one is a hit-target rule break on the tag links, and one is an invisible keyboard focus on the new SegmentedChoice. All are copy, state or CSS changes; none reopens the model.

## Principles check

| Principle | Result |
|---|---|
| One primary per screen | Holds. Add apps; Add to never record; Add N apps; Back to focus; Start shutdown. The session summary and the delete confirm follow the Dialog rules. |
| State never by colour alone | Holds for roles (glyph + word), segments (ground + underline + bold), picker rows (tick + ground), the role menu (ground + side bar + "Current"), disabled controls (dashed + words). |
| No red; amber = almost up; critical only destructive | Holds. No amber anywhere in the group; `critical` once, on "Delete recorded usage". Errors are neutral notices with the alert glyph. |
| Kind, plain copy | Holds. No exclamation marks or emoji. "That's fine." in every empty group. Two sentences stop being true in some states (c-tracking-1, c-tracking-3). |
| Slow motion, off under reduce-motion | Holds as stated: the breathing circle is the only loop and is static under reduce-motion; steps swap instantly; nothing ticks or flashes. Not drawn as a separate state, which the report says. |
| Contrast, focus ring, keyboard, VoiceOver | Contrast passes every pair in both themes. Focus ring drawn on IconButtons and the primary; **not** on the SegmentedChoice, whose radio is hidden (c-tracking-7). Tab order and VoiceOver labels are written for every control. The tag links break the 44px target rule (c-tracking-6). |
| Calm by default | Holds. No live feed, no badges, no bypass counts, no comparison with yesterday. Usage bars are neutral and the Review subtitle says "without a score". |
| Private by design | Holds in the model: bundle id or domain and minutes only, never-record list, pause, retention, export, delete. Two copy and layout faults: the Privacy helper contradicts what Usage shows for private apps (c-tracking-3), and compact Privacy drops export and delete (c-tracking-4). |
| Honest friction | Holds for Gentle and Firm. Strong lock's "quitting Orasenda ends it" stops being true once the helper is approved (c-tracking-1). End during Strong lock is undecided; a call is made below (c-tracking-13). |
| Productivity | Holds. Add is one dialog with one role decision; a role change is two actions; removal is a menu item with no confirm; the pause is one key. Fewer decisions at compact once c-tracking-14 drops the Profile select until profiles exist. |
| Owner 5 (tracking and blocking rethink) | Holds and improves on the brief: two pages by question, built-in safety apps with "Built in", recent apps only in the picker, usage only in Review. |
| Known issue (primary off-screen) | Holds by construction on Settings, Privacy, the picker and Review: header, segmented row and footer are fixed tracks; only the list region scrolls, with a visible bar and "More below". Measurement still owed at 360 wide (report's own note) and at 640–800 wide for the two-pane Settings (c-tracking-15). |
| Both themes | Drawn for every working component at 360×240, 900×600 and 1440×900. |
| Chosen direction (Still Point) | Followed: IconButton + Tooltip, in-webview popover for the role menu (radios and a checkbox, so the native-menu rule stands), fixed tracks, compact Back + title + "Add" pill with the word kept. |

## Contrast (contrast.py, light / dark)

Thresholds: text 4.5:1, UI marks 3:1. The script resolves `selection` to `focus-soft` and `focus-ring` to `focus`.

| Pair | Use on the canvas | Light | Dark | Need | Result |
|---|---|---|---|---|---|
| ink on surface | page text, helpers set to ink, Usage totals | 13.23 | 14.54 | 4.5 | pass |
| ink on surface-raised | row names, group text, choice labels, notices | 14.57 | 13.05 | 4.5 | pass |
| ink on surface-sunken | app-icon letters, search text, textarea | 11.88 | 15.34 | 4.5 | pass |
| ink on surface-overlay | dialogs, picker, tooltips, popover | 14.57 | 11.97 | 4.5 | pass |
| ink on selection | checked picker rows, selected segment, current role item | 12.11 | 10.69 | 4.5 | pass |
| ink-muted on surface | helpers, counts, "More below", bar glyphs | 5.36 | 7.52 | 4.5 | pass |
| ink-muted on surface-raised | role tags, "Built in", group glyphs, notice glyphs | 5.91 | 6.75 | 4.5 | pass |
| ink-muted on surface-sunken | search placeholder, disabled button labels | 4.82 | 7.94 | 4.5 | pass |
| ink-muted on surface-overlay | popover heading, strength line, context line, hints | 5.91 | 6.19 | 4.5 | pass |
| ink-muted on selection | unselected text inside a selected chip's helper | 4.91 | 5.53 | 4.5 | pass |
| on-focus on focus | primary buttons, picker checkbox tick | 5.94 | 9.23 | 4.5 | pass |
| focus on surface | bar fills (the bars sit on `surface`, not `surface-raised`), links, context shape, section-list current | 5.31 | 8.74 | 3 (mark) / 4.5 (text) | pass |
| focus on surface-raised | Focus role filled circle, Focus glyph in rows | 5.85 | 7.85 | 3 | pass |
| focus on surface-overlay | Focus item glyph in the role menu, ghost action text | 5.85 | 7.20 | 4.5 | pass |
| focus on selection | segment underline, current-item side bar, section-list current text | 4.86 | 6.43 | 3 / 4.5 | pass |
| focus on surface-sunken | picker checked box edge beside a sunken field | 4.77 | 9.23 | 3 | pass |
| line-strong on surface | list and segmented borders, scrollbar thumb | 4.35 | 5.56 | 3 | pass |
| line-strong on surface-raised | control and choice borders, "Built in" rows | 4.79 | 4.99 | 3 | pass |
| line-strong on surface-overlay | dialog, tooltip and popover edges, picker scrollbar | 4.79 | 4.58 | 3 | pass |
| line-strong on surface-sunken | search field, textarea and disabled-button dashed edges | 3.90 | 5.87 | 3 | pass |
| line-strong on selection | checked chip border, selected segment edge | 3.98 | 4.09 | 3 | pass |
| focus-ring on surface / surface-raised / surface-overlay | keyboard focus outline | 5.31 / 5.85 / 5.85 | 8.74 / 7.85 / 7.20 | 3 | pass |
| on-critical on critical | "Delete recorded usage" confirm | 6.90 | 8.49 | 4.5 | pass |
| critical on critical-soft | its hover and pressed state | 5.48 | 6.85 | 4.5 | pass |
| line on surface / surface-raised | hairlines: row separators, list edge, edge-row top border | 1.46 / 1.61 | 1.45 / 1.30 | decorative | expected fail; carries no meaning, except the segmented separators (c-tracking-8) |

`--all-text` reports 12 FAIL lines, all `line-strong` against a surface or tint at the 4.5:1 text threshold. `line-strong` is never used as text on this canvas, only as a mark, and it passes 3:1 in every one of those pairs. Nothing on the canvas uses amber, so `ink-muted on amber-soft` (5.01 / 5.90, pass) is not needed.

## Findings

Severity: **blocker** = the design cannot ship as drawn; **major** = fix before the design-system changes are written; **minor** = polish or a rule to record.

### c-tracking-1 (major) The Strong lock sentence becomes false once the helper is set up

**Where:** `Settings` strength radio ("…Strong friction, not a hard lock: quitting Orasenda ends it."); `Overlay` strong step description ("…quitting Orasenda ends it."); `Settings` helper notice ("a small helper that reopens Orasenda if it's quit during a lock").

**Finding:** The helper exists precisely so that quitting does not end the lock. With the helper approved, both sentences lie, and the honest way out (the Login Items switch) is not named anywhere. "Strong locks are described honestly as friction, not as unbreakable" (SPEC §1.3) needs the exit named in every helper state.

**Fix:** Two versions of the sentence, chosen by helper state. Without the helper: as drawn. With the helper: "Strong friction, not a hard lock: quitting Orasenda reopens it, and turning off Orasenda Helper in Login Items ends it." Use the same pair in the overlay's Strong lock description and in the strength line. Draw the "helper allowed" radio state on `Apps-Dark` beside the "not set up" one.

### c-tracking-2 (major) The fallback state names an app the overlay cannot know

**Where:** `Overlay` step `failed`: title "Discord was hidden", description "Orasenda couldn't show the pause, so it hid Discord instead.", ghost "Open Discord anyway"; `Overlay-Dark` caption.

**Finding:** The spike's fallback (`ConnectionFallback` in `Overlay.tsx`) renders when the overlay page cannot listen to `overlay-show`, which is the message that carries the app name. In that state the page does not know which app it covers and cannot send a choice for it, so neither the name nor "Open Discord anyway" is possible. The redesign is kinder than "The overlay could not connect." but promises an action the surface cannot perform.

**Fix:** Nameless copy with one action: title "Orasenda couldn't show the pause", description "Your session is still running. If an app was hidden, you can bring it back from the Dock.", Back to focus as the only button (it needs no app name; the backend already knows the session). Keep no scrim. The Dock is the honest "anyway" that needs no IPC. Fix the `Overlay-Dark` caption and the Controls table row. If the backend turns out to hide the app on an overlay failure, say "was hidden" plainly; if it does not, say nothing about hiding.

### c-tracking-3 (major) Privacy says minutes are never stored; Usage shows them

**Where:** `Settings` Privacy, Never record helper: "These are never stored, by name or by minutes; Review shows them as "Private apps"." `Usage`: "Private apps · 0h 20m"; session line "6 app switches · mostly a private app". `Main` legend: "No name and no minutes are stored."

**Finding:** Pooled minutes for private apps are stored somewhere, or Review could not show 0h 20m. The two pages describe different systems. On the one page whose job is to say exactly what is kept, the sentence must be true.

**Fix:** Decide once and say it. Recommended: the name is never stored; minutes are kept only as one anonymous "Private apps" total (that is what the brief and the Usage board already draw). Helper: "Their names are never stored. Their minutes count only toward one "Private apps" total in Review, and toward app switches." Change the `Main` legend to match. Keep "mostly a private app" in the session line as decided.

### c-tracking-4 (major) Compact pages drop controls, including export and delete

**Where:** `Settings` compact branch. Apps and sites at compact shows only the three lists: no strength radios, no Profile, no helper notice. Privacy at compact shows Record, Pause and the Never record list: no "Keep usage for", no "Export usage", no "Delete recorded usage…".

**Finding:** The brief allows compact pages to show "essential content only", but "delete everything in one click" (SPEC §2.6) and the strength choice (the one honest-friction decision) are essential. Someone running Orasenda in a small second-screen window cannot delete their usage or soften a lock without resizing the window.

**Fix:** Append the missing rows to the compact scroll region: on Apps and sites, the strength long chips under the Distracting tab's list (they stack at 328px; the Profile select goes with c-tracking-14); on Privacy, "Keep usage for", Export usage and Delete recorded usage… under the Never record list. Update the compact content estimates in `renderVals` so the "More below" row appears, and add both to the layout-test list on `Proof`.

### c-tracking-5 (major) The browser fallback is a rule the user never chose and cannot see in the list

**Where:** `Settings` Distracting group notice: "Sites need the Orasenda browser extension. Until it's installed, Safari counts as Distracting during Deep Work."

**Finding:** Safari is effectively Distracting in Deep Work but is not a row in the Distracting list, has no menu, and the user did not choose it (SPEC §1.2 "every block, rule and tracked category is chosen by the user"; SPEC §2.7 says "selected browsers", meaning the user selects). The `States` caption also promises that a row's "role word never lies about what is stored", and here the stored rule has no row. The picker makes it worse: Safari appears under Open now as an addable Neutral app while it is already being paused.

**Fix:** When the first site is added and the extension is missing, add a row for the default browser to Distracting with the quiet line "Browser fallback until the extension is installed" and a normal role menu (choosing Neutral removes the fallback for that browser). The notice shrinks to "Sites need the Orasenda browser extension." with Get the extension. The picker then shows Safari as "Already Distracting". Fix the mock's `hasSite` so the notice shows only when a site row exists.

### c-tracking-6 (major) Tag links are 18px tall and do not look like links

**Where:** `apps.css` `.ap-tag` (font 13px / 18px, `ink-muted`, no underline) used as `<a href="#privacy">` "Not recorded" on Apps and sites and as the role tag on Privacy; `Controls` tab-order row "←/→ between a row's tag link and its menu button".

**Finding:** Anything clicked is at least `hit-min` 44×44 (README). The tag is an 18px link in the same colour and weight as the static "Built in" text beside it, so sighted users cannot tell it is interactive, and it adds a second focusable element to every row, which is why the roving model needs ←/→. The report itself calls the tags read-only.

**Fix:** Make the tags plain text (`<span>`), as the report describes them. The role menu already carries Never record, so Apps and sites needs no trip to Privacy, and the Settings section list is one click away from Privacy. Rows then have exactly one interactive element (the menu button or Record again), the list is one tab stop with ↑/↓, and ←/→ is not needed. If a link is kept anywhere, it must be `ap-link` style (underline, `focus`) at 44px min-height. Update the Controls table and the VoiceOver rows.

### c-tracking-7 (major) Keyboard focus is invisible on the SegmentedChoice

**Where:** `apps.css` `.ap-seg input { position: absolute; opacity: 0; width: 1px; height: 1px }`; no `:focus-visible` rule on the label.

**Finding:** The design system puts the 2px `focus-ring` on the input. Here the input is a hidden 1px box, so the ring, if it appears at all, is a 1px dot nobody sees, and the label gets nothing. The Controls board claims "Focus is the design system's 2px focus-ring" but no focused segment is drawn. This is the "visible keyboard focus ring" principle.

**Fix:** `.ap-seg label:has(input:focus-visible) { outline: 2px solid var(--focus-ring); outline-offset: -2px; border-radius: inherit }` (inset, because the fieldset clips with `overflow: hidden`), or stop clipping and use the standard 2px offset. Draw one focused segment on `Apps-Dark` and add a row to the Controls table. Apply the same check to the picker's custom checkbox (`.ap-pick input`), which is visible but has no written focus style.

### c-tracking-8 (minor) Segmented separators are hairlines between adjacent targets

**Where:** `.ap-seg label { border-inline-start: 1px solid var(--line) }`.

**Finding:** Each option is a target; the boundary between two options is a mark that carries meaning, and `line` is 1.46:1. Only the outer `line-strong` border is visible, so three options read as one pill with three words.

**Fix:** `line-strong` for the inner separators (4.79 / 4.99 on `surface-raised`, pass).

### c-tracking-9 (minor) Usage bars borrow the Focus hue for Distracting time

**Where:** `.ap-bar-fill { background: var(--focus) }` for all three roles; `Usage-Board` lede "one hue (`focus`)".

**Finding:** The README reserves `focus` for Focus sessions, the primary button and selection. A Distracting bar in the Focus hue is not a colour-alone problem (glyph, word and duration are there), but it is the one place the mode hue means something else. The README's named "no hue" neutral is `ink-muted`.

**Fix:** Use `ink-muted` as the single bar fill (5.36 / 7.52 on `surface`, passes 3:1). Keep glyph + word + duration. Note in the report that the bars sit on `surface`, not `surface-raised`.

### c-tracking-10 (minor) The tallest pause steps are about 610px, not "about 500"

**Where:** `Proof` table "The pause: tallest step (Firm, typed reason) is about 500px".

**Finding:** By the tokens, Firm step 2 is: context 18 + title 28 + breath 96 + label 24 + textarea 72 + hint 36 + Continue 44 + 8 + Back to focus 52 + strength 18 = 396, plus seven `space-5` gaps (168) and `space-5` padding (48) = about 612. Gentle step 2 is about 560. A 1280×720 or 1366×768 second display has a visible frame of about 695–743 after the menu bar, so it fits; a 640-tall "More space" display does not, and `os-dialog` would scroll the pause.

**Fix:** Correct the number on `Proof`. Below 700px of visible height, hide the breathing circle on step 2 and the typed-reason step (IntentPrompt keeps it on step 1), and tighten the panel gap to `space-4`. Add the pause at 1280×720 and 1366×768 visible frames to the layout test.

### c-tracking-11 (minor) "It is 15:05." is a static clock in body copy

**Where:** `Overlay` waiting step description: "Discord stays hidden until then. It is 15:05. Go back to focus, or decide now."

**Fix:** Remove the sentence. The menu bar shows the clock, and a clock in a sentence goes stale or has to tick. Keep "You chose to wait until 15:12".

### c-tracking-12 (minor) Firm: nothing tells a VoiceOver user that Continue became available

**Where:** `Overlay-Light` Firm caption: "At 15:21 it becomes a normal quiet button; nothing ticks, flashes or announces."

**Fix:** The hint that already describes Continue ("Available at 15:21.") changes once to "You can continue now." and is `role="status"`, so it is read once and never repeats. No sound, no motion.

### c-tracking-13 (minor) End during Strong lock: a call

**Where:** report "notCovered": "Ending a session during Strong lock (whether End is allowed or confirmed on Today) is not decided."

**Call:** End stays available on Today, in the menu bar and with ⌘. during Strong lock, because "no way through in Orasenda until the session ends" names the session's end as the honest exit, and the lock must never be unbreakable. It is the one End that asks once: a non-destructive `Dialog` "End the session and the lock?" with "Keep going" as the safe default and Esc, so the friction matches the strength the user chose (Q3's "no confirm on End" stands for Gentle and Firm). Write it on the Strong lock caption and in the IntentPrompt change.

### c-tracking-14 (minor) The Profile select is a button pretending to be a select, and it arrives before profiles do

**Where:** `Settings` `.ap-select` ("Profile, Deep Work", `aria-haspopup="listbox"`), the "Profile" span with no `for`; the picker's "Add as" select.

**Fix:** Use a native `<select>` with a `<label for>` (or add a Select component to the design system; there is none). Label it "Strength for" so it reads as scoping, not as activating a profile. Until P6 adds profiles, show one strength row with no select: fewer decisions. For "Add as", default to Distracting in regular and to the current segment in compact; the report's "the group you came from" has no meaning in regular, where there is one Add apps button.

### c-tracking-15 (minor) Two-pane Settings is too narrow between 640 and about 800 wide

**Where:** `apps.css` `.ap-settings` (200px section list, `space-6` gaps and padding) with the compact threshold at 640.

**Finding:** At 640 wide the page gets 640 − 64 − 32 − 200 − 32 − 32 = 280px. The title and Add apps compete in the header, and a row leaves about 80px for the name beside the icon, tag and menu button. Nothing falls off, but it is not the layout drawn at 900.

**Fix:** Settings and Review use the compact drill-in below 800 wide (a page-level threshold beside the global 640), or the section list narrows to 160px. Add 640×480 and 800×480 to the layout test on `Proof`.

### c-tracking-16 (minor) Values that need tokens, and stand-ins that need components

**Where:** `apps.css`.

**Finding:** Un-tokened: row height 48px (regular), app-icon radius 5px, bar height 12px, bar columns 132 / 116 / 64 / 56, session time column 96px, picker height 520px, popover width 272px, textarea 72px, scrollbar 8px, edge row 24px, heading sizes written as px. Stand-ins: the search field is a `div role="search"` of spans, the Firm reason box a `div role="textbox"`.

**Fix:** Map to existing tokens where they fit (row 44 `hit-min` or 52 `control-lg`, not 48; icon radius `radius-sm`; edge row `hit-floor`; type sizes to `title`, `heading`, `body-sm`, `caption`) and name the rest in the design-system change (`bar-height`, `picker-height`, `popover-width`, `scrollbar-width`). The app uses `Input` and `TextArea`, never the stand-ins; say so in the AppPicker and IntentPrompt changes.

### c-tracking-17 (minor) States not yet drawn

**Where:** report "notCovered"; `States`, `Privacy`, `Picker-Board`.

**Fix (draw or caption):** Privacy load error; Never record list empty ("No private apps. That's fine."); helper declined (Strong lock chosen, helper refused, lock honestly weaker); the privacy-mode picker at compact; "Delete this day" dialog in Review (same `Dialog destructive` as the usage delete, title "Delete this day's usage?").

## Calls I accept as made

- Two Settings sections instead of one page with two sections. The duplicate row is gone and each page has one primary. Eight sections in the list is fine.
- Role changes and Never record live in one per-row menu; Neutral (remove from list) is the removal, with no confirm.
- Built-in safety apps cannot be moved or removed and say "Built in".
- Strength sits under Distracting, since it only applies there.
- Usage: one neutral hue, scaled to the largest role, no percentages, idle excluded with a footnote; per-session line only when recording was on; "mostly a private app".
- Recent apps only in Add apps, without durations; recording-off explained in one line without a nudge.
- Firm shows a clock time; Strong lock has one button; the waiting state keeps "I need Discord now".
- Permission table: no asks for detection; the helper and the extension at the moment of need; the detection-stopped notice ready to take "Open System Settings" if #61 ever needs it.
- ScrollRegion with a styled scrollbar and "More below". Note for the README: `::-webkit-scrollbar` overrides the user's macOS "Show scroll bars" setting; the edge row is the affordance that must stay even if the scrollbar styling is dropped later.
- Emergency contacts (SPEC §2.7 safety allowlist): with Phone, Messages and FaceTime built in, contacts are never blockable, so a contacts picker is redundant. Record a one-line SPEC amendment in phase 3 instead of designing it.

## Design-system changes, as reviewed

Approve, with the fixes above folded in: AppRow (tags as text, one interactive element per row, height from a token), RoleTag + glyph family and the "mode shapes are reserved for modes" rule, SegmentedChoice (focus-visible rule, `line-strong` separators), ScrollRegion, SettingsPage fixed header, AppPicker (native select, `Input`), IntentPrompt (context line, strength line, waiting / firm / strongLock variants; the fallback variant rewritten nameless; the two Strong lock sentences by helper state; End-during-lock confirm), NeutralBar (`ink-muted` fill), long Choice, the role menu popover, the Settings section list with Privacy, and the four README rules. The strength copy rule gains the helper-state pair from c-tracking-1.

---

# Re-review (round 2): Tracking, blocking and recent apps

- Date: 2026-11-09
- Reviewer: senior product design reviewer (fable)
- Canvas: https://claude.ai/artifact/66E6UxNb3GqCzopeqGAZad (version 1794247257-cbe2). Read as files: `canvas.json`, `Settings`, `Picker`, `Overlay`, `Usage`, `Main`, `Apps-Light`, `Apps-Dark`, `Privacy`, `States`, `Picker-Board`, `Overlay-Light`, `Overlay-Dark`, `Usage-Board`, `Controls`, `Proof`, `apps.css`.
- Scope: only whether each round-1 finding is fixed and whether the fixes introduced a new principle violation. Contrast re-run by script for every pair that failed or changed.

## Verdict: approve with changes (minor only; no further review round needed)

All seventeen findings are fixed as reported, and the fixes hold to the principles. The Strong lock sentence now names the real exit in every helper state (radio, pause description, strength line, and the quiet Login Items line when the helper is allowed). The fallback names no app and offers only Back to focus. Privacy, the Main legend, the Privacy lede and the session-summary caption now describe the same system (names never stored; minutes only in one anonymous "Private apps" total and toward switches). Compact pages keep strength, retention, Export and Delete. Safari is a visible, user-changeable Distracting row and the notice says only what is true. Tags are plain spans, so every row has exactly one interactive element and the lists are one tab stop each. The segmented and picker focus rings are written and drawn. Separators are `line-strong`, bars are `ink-muted`, the pause heights are corrected with a tight variant, the static clock is gone, Firm's hint is a one-shot status, End during Strong lock asks once with Keep going as the safe default, the selects are native with real labels, Settings and Review drill in below 800 wide, and the five missing states are drawn. The canvas index has no overlaps (checked the board rectangles).

Two small gaps appeared in the compact Apps and sites page as a side effect of c-tracking-4, plus two residual notes. They are fold-in items for the design-system change, not blockers.

## Round-1 findings: status

| Id | Status | Checked where |
|---|---|---|
| c-tracking-1 | Fixed | `Settings` `S_NO` / `S_HELPER` by `helperOn`; the helper-allowed line names System Settings › General › Login Items; `Overlay` `strong` by `helper`; `STRONG_LINE`; `Apps-Dark` helper-allowed frame and caption; `Main` call. See note N1 below. |
| c-tracking-2 | Fixed | `Overlay` `failed`: nameless title and description, `context`, `scrim`, `breath`, `hasStrength` all off, Back to focus only; `Overlay-Dark` caption; `States` permissions row; `Controls` pause row. |
| c-tracking-3 | Fixed | Never record helper (`Settings` line 173), `Main` legend, `Privacy` lede, `Usage-Board` summary caption all say the same thing; `Usage` keeps "Private apps · 0h 20m" and "mostly a private app". |
| c-tracking-4 | Fixed | Compact Apps: extension line and three long chips under the Distracting list (`cStrength`), drawn on `Apps-Light` at scroll 380. Compact Privacy: Keep usage for, Export usage, Delete recorded usage… (`Settings` lines 287–292), drawn on `Privacy` at scroll 470. Estimates updated; both in the `Proof` layout test. Two side effects: c-tracking-18. |
| c-tracking-5 | Fixed | Safari row with "Browser fallback until the extension is installed"; `hasSiteRow` gates the notice; notice is one sentence + Get the extension; picker shows Safari "Already Distracting"; `States` permissions row; `Apps-Light` "Reading a row". |
| c-tracking-6 | Fixed | `.ap-tag` is a span, "never a link, never focusable"; no `href` on any tag; ←/→ removed from `Controls`; VoiceOver rows read "Stocks, Not recorded"; `.ap-link` has `min-height: var(--hit-min)`. |
| c-tracking-7 | Fixed | `.ap-seg label:has(input:focus-visible)` 2px `focus-ring` at 2px offset, `z-index: 1`; fieldset no longer clips (rounded first/last labels); drawn on `Apps-Dark` (`focus="seg"`); `.ap-pick:has(input:focus-visible)` rings the row, drawn on the compact privacy picker. |
| c-tracking-8 | Fixed | `.ap-seg label { border-inline-start: 1px solid var(--line-strong) }`: 4.79 / 4.99 on `surface-raised`. |
| c-tracking-9 | Fixed | `.ap-bar-fill { background: var(--ink-muted) }`: 5.36 / 7.52 on `surface` (bars sit on the page `surface`); `Usage-Board` lede corrected. |
| c-tracking-10 | Fixed | `Proof` says about 636 (Firm step 2) and 560 (Gentle step 2); `tight` below 700 visible drops the breath and uses `space-4` (about 460); drawn on `Overlay-Dark` with `visible="640"`; 1280×720, 1366×768 and 640 in the layout test; frames 960×720. |
| c-tracking-11 | Fixed | "It is 15:05." removed; waiting step keeps the title time and "Discord stays hidden until then." |
| c-tracking-12 | Fixed | Firm step 1 hint is `role="status"`, changes once to "You can continue now."; `firm1ready` drawn; `Overlay-Light` caption rewritten. |
| c-tracking-13 | Fixed | Non-destructive Dialog "End the session and the lock?", Keep going primary with initial focus and Esc/Return, End session quiet; drawn light and dark on `States`; written on `Main`, `Overlay-Light`, `Controls`. Gentle and Firm keep no-confirm End. |
| c-tracking-14 | Fixed | Profile select removed; "Strength for" written for P6; "Add as" and "Keep usage for" are native `<select>` with `<label for>`; Add as defaults to Distracting in regular and the current segment in compact (`as` prop). See c-tracking-19 for the compact label. |
| c-tracking-15 | Fixed | `compact = w < 800 \|\| h < 480` in both `Settings` and `Usage`; 640×480 drawn on `Proof` with the 280px arithmetic; 640–799 row; 640×480 and 800×480 in the layout test. |
| c-tracking-16 | Fixed, with residue | Type shorthands, `control-lg` / `hit-min` rows, `icon-lg` + `radius-sm` icons, `hit-floor` edge, `control-sm` bars, subgrid columns, proposed tokens named (`bar-height`, `picker-height`, `popover-width`, `scrollbar-width`); `Input type=search` and `textarea.os-input`. Residue in note N2. |
| c-tracking-17 | Fixed | Privacy load error (900 dark + 360 dark), empty Never record (360 light), helper declined (`Apps-Dark`), compact privacy picker (`Picker-Board`, 360 dark), "Delete this day's usage?" (`Usage-Board`). |

## Contrast re-run (contrast.py, light / dark)

| Pair | Why re-run | Light | Dark | Need | Result |
|---|---|---|---|---|---|
| line-strong on surface-raised | c-8 segmented separators | 4.79 | 4.99 | 3 | pass |
| ink-muted on surface | c-9 bar fill on the page surface | 5.36 | 7.52 | 3 | pass |
| focus-ring on surface | c-7 segment ring, which sits outside the fieldset over the page | 5.31 | 8.74 | 3 | pass |
| focus-ring on surface-raised | c-7 segment ring over the fieldset | 5.85 | 7.85 | 3 | pass |
| focus-ring on surface-overlay | c-7 picker row ring | 5.85 | 7.20 | 3 | pass |
| ink-muted on surface-overlay | picker "Already Distracting" rows, footer labels | 5.91 | 6.19 | 4.5 | pass |
| on-focus on focus | new Keep going primary (c-13) | 5.94 | 9.23 | 4.5 | pass |
| focus on surface | `.ap-link` (compact Try again, Get the extension, Usage link) | 5.31 | 8.74 | 4.5 | pass |
| ink on surface-raised | new Safari row and helper-allowed line | 14.57 | 13.05 | 4.5 | pass |
| ink-muted on surface-raised | role tags as spans, "Built in" | 5.91 | 6.75 | 4.5 | pass |
| line-strong on surface-sunken | disabled Continue dashed edge (mark) | 3.90 | 5.87 | 3 | pass (fails 4.5 as text; it is never text) |

No amber or red anywhere; `critical` on the two delete confirms only.

## Remaining findings

### c-tracking-18 (minor, new) Compact Apps and sites has the strength radios but not the helper rows

**Where:** `Settings` compact branch, lines 259–266 (`cStrength`); `renderVals` `cDist`.

**Finding:** The compact radios let someone choose Strong lock, and the sentence is honest in every helper state, but none of the four helper rows (Set up the helper, waiting, allowed line with the Login Items location, declined) is rendered in compact. Someone in a small second-screen window can pick Strong lock and never be offered the helper, and never see where the Login Items switch is. Also, `cStrength` requires a non-empty Distracting list, so the compact empty state hides the radios while the regular empty state shows them.

**Fix:** Render the same `helperAsk` / `helperWait` / `helperOn` / `helperDeclined` rows under the compact radios (the compact `ap-rowline` form with a link, like the detection line, is fine), add about 60px to the compact content estimate when one shows, and show the radios in compact whenever `lists` is true, not only when the list has rows. Add "helper action (when shown)" to the compact tab-order row.

### c-tracking-19 (minor, new) The compact "Add as" label is hidden, but the Controls table says it is visible

**Where:** `Picker` compact footer: `<label class="os-sr-only">Add as</label>`; `Controls` VoiceOver row "Add as / Keep usage for: Native select with a visible label".

**Finding:** The select shows a role word, so it is readable without the label, and 328px is tight; hiding the label is a reasonable call. But the Controls table states the opposite, and the design-system Select rule will be written from it.

**Fix:** Either show "Add as" as a visible `label` in the compact footer (the footer grid has room above the select at 60px tall), or make the table row say "visible label in regular; sr-only label in compact, where the select's value is the role word". Pick one and write it in the AppPicker change.

### Notes (no id; fold into the design-system change)

- **N1 (on c-tracking-1):** in the mock the helper-allowed sentence is keyed on `state === 'helperOn'`, which also means Strong lock is chosen. The README rule must key the pair on helper approval alone, so the Strong lock radio reads "quitting Orasenda reopens it…" even while Gentle is selected. The fix report says "depends on the helper state", which is the right rule; make sure the written rule says so explicitly.
- **N2 (on c-tracking-16):** residual raw values, all in mock inline styles: `margin-top: 3px` on the four Privacy checkboxes (use the `calc((1lh - var(--icon-md)) / 2)` already used for `.ap-choices`), the Session summary `h2` `font-size: 17px; line-height: 24px` (use `var(--type-heading)`), and the picker's drawn scrollbar `top: 8px; right: 4px; height: 120px` (mock-only). The `--type-*` font shorthands are declared in `apps.css`; the design-system change should add them to `orasenda-tokens.css` so app code gets them from one place.

## Calls I accept as made this round

- Safari as a normal Distracting row with a role menu; Neutral removes the fallback.
- Fallback copy hedged with "If an app was hidden" until the backend's behaviour on overlay failure is confirmed.
- One strength for every session until P6; "Strength for" then.
- Keep going as the primary in the End-during-lock dialog; it is friction matched to the chosen strength, not a guilt prompt.
- The 800px page threshold for Settings and Review, beside the global 640.
- "You can continue now." as the one status change on Firm; no sound or motion.

## Design-system changes, as re-reviewed

Approved to write, with c-tracking-18, c-tracking-19, N1 and N2 folded in. No further review round is needed before the design-system update; the implementer can check the four items against this list.

---

# Re-review (round 2, verification pass): Tracking, blocking and recent apps

- Date: 2026-11-09
- Reviewer: senior product design reviewer (fable)
- Canvas: https://claude.ai/artifact/66E6UxNb3GqCzopeqGAZad, still version 1794247257-cbe2: the canvas has not changed since the round-2 re-review above. Re-read as files: `canvas.json`, `Settings`, `Overlay`, `Picker`, `apps.css`, `Controls`, `Proof`, `Usage`, `Main`, `States`.
- Scope: the designer's fix report for c-tracking-1 to c-tracking-17, checked against the files rather than the report; contrast re-run by script for every pair that failed or changed.

## Verdict: approve with changes (minor only; no further review round needed)

The round-2 verdict stands unchanged. Every round-1 finding is fixed in the files as reported, and the fixes introduce no new principle violation:

- c-1: `S_NO` / `S_HELPER` in `Settings`, the `helper` branch of `strong` in `Overlay`, `STRONG_LINE`, and the helper-allowed `ap-help` line naming Login Items. Note N1 (key the pair on helper approval, not on `state === 'helperOn'`) still applies to the written rule.
- c-2: `failed` has a nameless title and description, `context`, `scrim`, `breath` and `hasStrength` all false, Back to focus only.
- c-3: Never record helper (`Settings` line 173) and the `Main` legend say the same thing: names never stored, minutes only in one anonymous "Private apps" total and toward app switches.
- c-4: compact Apps renders `cStrength`; compact Privacy renders Keep usage for, Export usage and Delete recorded usage… (`Settings` lines 288–291).
- c-5: Safari row "Browser fallback until the extension is installed"; `hasSiteRow` gates the one-sentence notice; the picker shows Safari "Already Distracting".
- c-6: `.ap-tag` is a span with no `href`; `Controls` says "Not focusable" for both tags; `.ap-link` has `min-height: var(--hit-min)`; no ←/→ between tag and menu (the ←/→ that remains is inside the segmented radio group, which is correct).
- c-7: `.ap-seg label:has(input:focus-visible)` with a 2px `focus-ring` at 2px offset, no fieldset clipping; `.ap-pick:has(input:focus-visible)` rings the whole row.
- c-8: `border-inline-start: 1px solid var(--line-strong)`.
- c-9: `.ap-bar-fill { background: var(--ink-muted) }`.
- c-10: `Proof` says about 636 / 560 / 460 with the 700px threshold; `tight` in `Overlay` drops the breath and uses `space-4`.
- c-11: no "It is 15:05." anywhere.
- c-12: both Firm hints are `role="status"`; `firm1ready` reads "You can continue now."
- c-13: `States` draws "End the session and the lock?" with Keep going as the focused primary and End session quiet; `Controls` and `Main` state it.
- c-14: no Profile select; "Add as" and "Keep usage for" are native `<select>` with `<label for>`; `as` defaults to Distracting in regular.
- c-15: `compact = w < 800 || h < 480` in `Settings` and `Usage`; 640–799 row and 280px arithmetic on `Proof`.
- c-16: `--type-*` shorthands and the four proposed tokens are declared at the top of `apps.css`; rows use `control-lg` / `hit-min`; `Input type=search` and `textarea.os-input`. N2 residue stands.
- c-17: the five states are drawn (checked `States` and the `Apps-Dark` / `Privacy` / `Picker-Board` / `Usage-Board` titles in the index; the round-2 pass read those boards).

## Contrast re-run (contrast.py, light / dark)

Same pairs as the round-2 table, same results: line-strong on surface-raised 4.79 / 4.99 (3, pass); ink-muted on surface 5.36 / 7.52 (pass); focus-ring on surface 5.31 / 8.74, on surface-raised 5.85 / 7.85, on surface-overlay 5.85 / 7.20 (3, pass); ink-muted on surface-overlay 5.91 / 6.19 (4.5, pass); on-focus on focus 5.94 / 9.23 (pass); focus on surface 5.31 / 8.74 (pass); ink on surface-raised 14.57 / 13.05 (pass); ink-muted on surface-raised 5.91 / 6.75 (pass); ink on surface-sunken 11.88 / 15.34 (pass); line-strong on surface-sunken 3.90 / 5.87 (3 as a mark, pass; fails 4.5 as text, and it is never text).

## Remaining findings (unchanged)

- **c-tracking-18 (minor):** still open. `cDist = apps && tab === 'distracting' && lists && !empty` gates the compact radios, and the compact branch renders none of `helperAsk` / `helperWait` / `helperOn` / `helperDeclined`. Fix as written above.
- **c-tracking-19 (minor):** still open. Compact `Picker` footer has `<label class="os-sr-only">Add as</label>` while `Controls` row 89 says "Native select with a visible label". Pick one and write it in the AppPicker change.
- Notes N1 and N2: fold into the design-system change.

No blocker or major remains. The design-system changes may be written with c-tracking-18, c-tracking-19, N1 and N2 folded in.
