# Review E: Onboarding

- Date: 2026-11-09
- Reviewer: senior product design reviewer (fable)
- Canvas: https://claude.ai/artifact/XPG6fXqiVfT8y1gTxpzKoz (version 1794245519-cce7). Read as files: `canvas.json`, `Main`, `Window`, `FirstRun-Light`, `FirstRun-Dark`, `Tips`, `Returning`, `Keys`, `Deferred`, `onboarding.css`, `still-point.css`, `orasenda-tokens.css`.
- Checked against: SPEC §1, the owner direction and decided items, `03-direction-pick.md` (grafts and must-fixes), `01-brief.md` §2.1, §3.1, §3.6, §3.15, Q4–Q6, Q21; spec A (Today contract, notification request, relaunch recovery, status lines); design system README, `tokens.json`, `InlineNotice` README, `bundle.css`.
- Contrast: every pair run through `contrast.py` in both themes (table below).

## Verdict: approve with changes

The core call is right and it is the strongest possible answer to "shortest path to a first session": there is no onboarding, Today is the first run, Start focus holds focus, and Return starts. Nothing is asked, no permission is requested at launch or at Start (owner direction 3), tracking is off, and the P3 setup is pushed to Routines. The two tips are placed between tasks, never during one, each once, with one ghost action and no coach marks. The returning state has no welcome back, recap or streak. The 360×240 arithmetic checks (12 + 44 + 8 + 44 + 8 + 52 + 8 + 52 + 12 = 240; digits at 34px + 6 + 10 = 50 inside the 52px time row). Both themes are drawn at the minimum, the default and a large window. The denied-notification state is a hollow circle, a plain line and a quiet button, never amber or critical. All contrast pairs pass their thresholds.

Three majors need fixing before the design-system changes are written: the first-run screen says "25 minutes" three times, the mode chip sits inside the live region in the stacked layout, and key glyphs in the tips have no spoken name. The rest is polish and rules to write down.

## Principles check

| Principle | Result |
|---|---|
| One primary per screen | Holds. Start focus is the one primary; "Got it" and "Open System Settings" are ghost or quiet. |
| State never by colour alone | Holds for modes. The tip is marked by the word "Tip:" and weight, not colour. See e-onboarding-5 on the hollow circle doing two jobs. |
| No red; amber = almost up; critical only destructive | Holds. Denied permission and store errors are neutral. |
| Kind, plain copy | Holds. No exclamation marks or emoji. "Welcome. Nothing to set up." is kind. The 25-minute repetition is the one copy problem (e-onboarding-1). |
| Slow motion, off under reduce-motion | Nothing animates in these states. The status row's appearance should follow the Today status-row rule (duration-calm, instant under reduce-motion). |
| Contrast, focus ring, keyboard, VoiceOver | Contrast passes everywhere. Focus ring 2px `focus-ring` with 2px offset is drawn. Tab order matches the pick (must-fix 4). Two VoiceOver gaps: the chip in the live region (e-onboarding-2) and unlabeled key glyphs (e-onboarding-3). |
| Calm by default | Holds. One line at a time, no badges, no checklist. Two tips in a lifetime. |
| Private by design | Holds. Tracking off; every permission at the click that needs it. |
| Honest friction | n/a here. |
| Productivity | Holds. First session is one keystroke; returning session is one keystroke; nothing is decided before Start. e-onboarding-4 keeps the one lesson from vanishing unread. |
| Owner 1 minimal Today | Holds; onboarding adds nothing to Today but one line in the reserved row. |
| Owner 3 notifications off, no prompt until on | Holds. Spec A must be amended (e-onboarding-12). |
| Owner 4 Settings | The Notifications row is drawn at its moment of need; General gains a checkbox I would remove (e-onboarding-6). |
| Known issue (Start off-screen) | Holds by construction: fixed tracks, reserved 44px row, no scroll. Measurement still owed (e-onboarding-9, e-onboarding-10). |
| Both themes | Drawn. |

## Contrast (contrast.py, light / dark)

Thresholds: text 4.5:1, UI marks 3:1.

| Pair | Use | Light | Dark | Need | Result |
|---|---|---|---|---|---|
| ink on surface | status row, tip text | 13.23 | 14.54 | 4.5 | pass |
| ink-muted on surface | preset summary, "25 min", ghost icon glyphs, hollow status shape | 5.36 | 7.52 | 4.5 | pass |
| on-focus on focus | Start pill text and glyph, checkbox tick | 5.94 | 9.23 | 4.5 | pass |
| focus-ring on surface | focus outline | 5.31 | 8.74 | 3 | pass |
| focus-ring on surface-raised | focus outline on Settings row | 5.85 | 7.85 | 3 | pass |
| focus-ring on surface-sunken | focus outline on board ground | 4.77 | 9.23 | 3 | pass |
| focus-ring on surface-overlay | focus outline inside popovers | 5.85 | 7.20 | 3 | pass |
| ink on surface-overlay | tooltip text, macOS alert stand-in | 14.57 | 11.97 | 4.5 | pass |
| ink-muted on surface-overlay | tooltip kbd (`sp-kbd`) | 5.91 | 6.19 | 4.5 | pass |
| line-strong on surface-overlay | tooltip and alert edge | 4.79 | 4.58 | 3 | pass |
| ink on surface-raised | Kbd text, Pause glyph, os-choice label | 14.57 | 13.05 | 4.5 | pass |
| ink-muted on surface-raised | No session chip, rail labels | 5.91 | 6.75 | 4.5 | pass |
| line-strong on surface | Pause edge, bar track, hollow circle, Kbd edge on surface | 4.35 | 5.56 | 3 | pass |
| line-strong on surface-raised | Kbd edge, os-choice border | 4.79 | 4.99 | 3 | pass |
| line-strong on surface-sunken | step numbers on the board | 3.90 | 5.87 | 3 | pass |
| line-strong on selection | checked os-choice border | 3.98 | 4.09 | 3 | pass |
| focus on surface | stacked bar fill, "Got it" ghost text | 5.31 | 8.74 | 4.5 | pass |
| focus on surface-raised | current rail item text | 5.85 | 7.85 | 4.5 | pass |
| focus on surface-sunken | board accents | 4.77 | 9.23 | 4.5 | pass |
| focus on focus-soft | Focus chip | 4.86 | 6.43 | 4.5 | pass |
| focus on selection | current rail item, key step border | 4.86 | 6.43 | 4.5 | pass |
| ink on selection | checked os-choice row | 12.11 | 10.69 | 4.5 | pass |
| ink-muted on selection | helper on a checked row | 4.91 | 5.53 | 4.5 | pass |
| ink on surface-sunken | board ground text | 11.88 | 15.34 | 4.5 | pass |
| ink-muted on surface-sunken | board captions | 4.82 | 7.94 | 4.5 | pass |
| amber on surface | (B) warning status text | 5.51 | 9.53 | 4.5 | pass |
| surface-raised on surface | Kbd and Pause ground, informational | 1.10 | 1.11 | none | not a mark; the `line-strong` edge carries the boundary, as the README requires |
| surface-overlay on surface | tooltip ground, informational | 1.10 | 1.21 | none | not a mark; the edge carries it |

`--all-text` reports 12 FAIL lines, all `line-strong` as *text* on tints. `line-strong` is never used as text on this canvas, only as an edge or mark, where it needs 3:1 and passes everywhere.

## Findings

### e-onboarding-1 (major) The first-run screen says "25 minutes" three times

**Where:** `Window.dc.html` welcome state; `FirstRun-*` 360×240 idle; `Main` step 1.

**Finding:** At 360×240 idle the top row reads "Classic · 25 min · ends 15:20", the time row reads "25 min" in `timer-md`, and the status row reads "Start focus runs 25 minutes." At 900×600 it is twice (summary and welcome). The pick marked B down for stating one fact twice on a calm screen; this states it three times on the smallest screen. The welcome line is also copy outside spec A's Today contract, and the pick's must-fix 3 says status-row lines come from the spec.

**Fix:** Welcome line becomes "Welcome. Nothing to set up." (27 characters, no action, clears on first Start), or drop it: the hollow ring, "No session" and a focused Start focus already explain the screen. In the stacked idle time row show the chip alone (idle has no digits, as the ring's idle has none); the summary keeps the minutes. Record the welcome line, if kept, as a spec A amendment together with e-onboarding-12.

### e-onboarding-2 (major) The mode chip sits inside the live region in the stacked layout

**Where:** `Window.dc.html`, `.sp-status[role="status"][aria-live="polite"]` contains the `os-chip` when `chipInStatus`.

**Finding:** While active at 360×240 the ModeChip is a child of the status live region. Every chip change (Focus → Paused → Focus, and in B Almost up, Break) is then announced, which spec A forbids ("started, paused and resumed are not announced"), and the chip text is read along with every message. The chip is state, not a status message.

**Fix:** The live region wraps only the message paragraph (`.sp-status-msg`); the chip and the action are siblings inside the row. Write this into the StatusRow rule: "`role=status` is on the message, never on the row."

### e-onboarding-3 (major) Key glyphs in the tips have no spoken name

**Where:** `.ob-kbd` "⌃⌥F", "⌘↩", "F" in `tip-shortcut`, `tip-vo`, `tip-fv`; `Keys` VoiceOver table.

**Finding:** VoiceOver reads "⌃⌥F" as "up arrowhead, option, F" or skips the symbols depending on verbosity; "⌘↩" has no reliable reading. The one thing the tip teaches is the part VoiceOver cannot say, and the VoiceOver table on `Keys` does not list the status line's spoken form.

**Fix:** Kbd carries `aria-label` with the macOS spoken form ("Control-Option-F", "Command-Return", "F"), or a visually hidden text sibling; add a row to the VoiceOver table for each tip's spoken line. Put this in the Kbd component rule: a Kbd always has a spoken name.

### e-onboarding-4 (minor) The one lesson is dismissed by the action it sits beside

**Where:** `Main` rules: "Starting a session also counts as seen."

**Finding:** A person who ends a session and presses Return to start the next one never gets to read tip 1, and it never returns. For the audience, a line that vanishes on the first glance is a lesson not taught. "Got it" already exists as the explicit skip.

**Fix:** Mark a tip seen on "Got it", on using the feature, or after its second showing (two idle stretches). Never on Start. Keep "one tip per idle stretch" and "a store line wins the row".

### e-onboarding-5 (minor) The hollow circle does two jobs on one screen

**Where:** `.sp-status-msg .os-shape` (hollow circle, `ink-muted`) before every neutral line; the idle chip.

**Finding:** At 360×240 idle, the time row shows the hollow circle meaning "No session" and the status row shows a hollow circle meaning "a message". The design system reserves mode shapes for modes (brief F3) and `InlineNotice`'s neutral tone has no shape; only `warning` has the triangle.

**Fix:** Neutral status lines carry no shape; the triangle appears only for warning. This also returns 18px of width to the line at 360.

### e-onboarding-6 (minor) "Getting-started tips" is a permanent setting for two lifetime lines

**Where:** `Deferred` table; `Main` rules; dsChanges "Settings › General: Getting-started tips".

**Finding:** The welcome shows before anyone can reach Settings, and the two tips are gone after two sessions, so the checkbox almost never changes anything, while it sits in General for every later user. Fewer decisions is the brief.

**Fix:** Drop the setting. "Got it" is the per-tip skip, and two tips is the lifetime total. Reintroduce a setting only if P3's setup steps need a global off switch.

### e-onboarding-7 (minor) Focus target after a session ends is not written

**Where:** `Keys` tab-order panel; `Tips` lede ("Focus stays on Start").

**Finding:** While running, focus is usually on Pause or End. At the end those controls unmount and Start returns. The canvas defines focus for launch and for relaunch into a running session, not for the ended transition, which is when the tip appears.

**Fix:** State the rule: at any end (natural or End), focus moves to Start focus, the status line is announced through `role=status` before that move, and "Got it" is one Shift-Tab away. Add it to the tab-order panel and the StatusRow rule.

### e-onboarding-8 (minor) "Launch focus does not open its tooltip" needs a mechanism

**Where:** `Keys` caption; calls list.

**Finding:** WebKit matches `:focus-visible` for programmatic focus when no pointer event has happened, so a tooltip bound to `:focus-visible` would open on launch.

**Fix:** Tooltip opens on focus only after a keyboard event has been seen in the window (an input-modality flag), and always on hover. Record in the IconButton and Tooltip rule.

### e-onboarding-9 (minor) The preset summary is within 6px of clipping at 360 wide

**Where:** `.ob-stack .sp-summary` 13px, `white-space: nowrap`, `max-width: 100%`; top row 44 + 8 + summary + 8 + 44 in 336px.

**Finding:** "Classic · 25 min · ends 15:20" at 13px with chevron and padding is about 226 of 232px available. Font metric drift or a longer preset name ("Deep Block · 90 min · ends 16:50") clips with no rule.

**Fix:** At compact the summary reads "Classic · ends 15:20" (the minutes are in the popover), and the accessible name keeps the full phrase. Add the longest preset name to the layout test at 360×240.

### e-onboarding-10 (minor) Layout test cases this canvas adds

**Fix:** Add to the Playwright WebKit test from the pick (must-fix 10), with the bundled Atkinson fonts and once with Lexend: (a) 360×240 idle with the longest tip "Session ended. Tip: The menu bar item starts focus from anywhere." and "Got it"; (b) 360×240 running with the Focus chip and the standing line "Orasenda can't save sessions right now." sharing the row; (c) 360×240 with the longest preset summary; asserting the status row is exactly 44px and nothing overflows it. Do not add `overflow: hidden` to the row, because that would hide store lines; copy length is the guard.

### e-onboarding-11 (minor) After "Open System Settings" the row must follow the system

**Where:** `Deferred` state 3b.

**Fix:** On window focus the row re-reads the authorization status; when it becomes granted, the line and the button disappear and the checkbox is one tick away (no prompt will appear). Write that the tick is never flipped on by the app; the person's one tick stays the only decision.

### e-onboarding-12 (minor) Spec A amendments to name in phase 3

**Where:** spec A: notification request at first Start and the Today line "Orasenda can tell you when a session ends…"; `notify.session_end` default true; status lines.

**Fix:** Record one amendment: the request moves to the Settings › Notifications tick; the Today line is removed; `notify.session_end` defaults to false (migration per brief Q4); the status row's allowed lines gain the tips and, if kept, the welcome line.

### e-onboarding-13 (minor) What "Got it" removes

**Fix:** State that "Got it" removes only the tip; "Session ended." stays until the next transition, as spec A says.

## Calls I accept as made

- No screens before the first session; Today is the first run; Start holds focus on launch.
- Tips after the first and second ends, joined to "Session ended.", skipped if the feature was already used, with the menu-bar, VoiceOver and single-key-off variants.
- No tips while the store cannot be written.
- Relaunch into a running session: no message, focus on the hidden heading.
- The P3 setup is offered from Routines later.
- The denied permission state is neutral; the macOS alert is a stand-in.
- The 360×240 minimum with the stacked strip, subject to the measured fit in e-onboarding-10.

---

# Re-review E: Onboarding (scoped)

- Date: 2026-11-09
- Canvas version read: 1794246202-36b1. Files read: `canvas.json`, `Main`, `Window`, `FirstRun-Light`, `FirstRun-Dark`, `Tips`, `Returning`, `Keys`, `Deferred`, `onboarding.css`, `still-point.css` (status, summary and kbd rules).
- Scope: only whether each earlier finding is fixed and whether the fixes introduced a new principle violation.

## Verdict: approve

All thirteen findings are fixed on the canvas, in the drawn states and in the written rules. The fixes introduce no principle violation. Two minor hygiene items remain and need no re-review.

## Findings, one by one

| Id | Status | Evidence |
|---|---|---|
| e-onboarding-1 (major) | Fixed | `Window` welcome `pre` is "Welcome. Nothing to set up."; the stacked idle `.ob-time` holds only the No session chip; the 360 summary reads "Classic · ends 15:20", so the minutes appear once at compact (in the popover) and once at regular (in the summary). Main step 1 and the Deferred amendment record the line. |
| e-onboarding-2 (major) | Fixed | `role="status" aria-live="polite"` is on `p.sp-status-msg.ob-msg`, always mounted; the chip (`chipInStatus`) and "Got it" are siblings in `.sp-status`. The rule is in `onboarding.css`, the Tips lede, the Keys VoiceOver table and the amendment panel. |
| e-onboarding-3 (major) | Fixed | `.ob-kbd` is `aria-hidden` with an `os-sr-only` sibling ("Control-Option-F", "Command-Return", "F key"). Keys table gained Welcome, Tip 1 (three variants), Tip 2 and "Kbd (any)" rows. |
| e-onboarding-4 (minor) | Fixed | Main rules: seen on "Got it", on use, or after the second showing; never on Start. Repeated in the Tips lede. |
| e-onboarding-5 (minor) | Fixed | No `os-shape` inside `.ob-msg`; Deferred 3b line is plain text; Main rule and caption say neutral lines carry no shape, triangle for warning only. |
| e-onboarding-6 (minor) | Fixed | Deferred table row reads "Nowhere: no setting, by design"; Main rules say "No settings switch for tips." |
| e-onboarding-7 (minor) | Fixed | Keys tab-order panel: at any end (natural, ⌘. or End) the line is announced through `role=status`, then focus moves to Start focus, "Got it" one Shift-Tab away. Repeated in Tips lede and Main step 3. |
| e-onboarding-8 (minor) | Fixed | Keys lede and panel: tooltips open on hover always, on focus only after a keyboard event has been seen (input-modality flag), because WebKit matches `:focus-visible` for programmatic focus. |
| e-onboarding-9 (minor) | Fixed | `sum()` drops the minutes when `compact`; `sumL()` keeps the full accessible phrase; `preset` prop added; "Deep Block · ends 16:50" drawn on Returning (dark) and Deferred case 3 (both themes). |
| e-onboarding-10 (minor) | Fixed | Deferred "Layout test (Playwright, WebKit)" panel: Atkinson and Lexend runs, the three 360×240 cases drawn beneath it (new `running-store` state), 44px row assertion, 65-character copy guard, no `overflow: hidden`. Measurement remains the test's job, as the panel says. |
| e-onboarding-11 (minor) | Fixed | Deferred step 3c in both themes; caption and rule: status re-read on window focus, line and button disappear when granted, checkbox unticked, the app never ticks it on. |
| e-onboarding-12 (minor) | Fixed | Deferred "Spec A amendment (recorded in phase 3)" panel: request moves to the Settings tick, Today line removed, `notify.session_end` false with the Q4 migration, allowed status lines gain the welcome and tips, live region is the message. |
| e-onboarding-13 (minor) | Fixed | Tips caption and Main rules: "Got it" removes only the tip; "Session ended." stays until the next transition. |

## New-violation check on the fixes

- One primary: unchanged; "Got it" is still a ghost text button.
- State never by colour alone: removing the hollow circle leaves the tip marked by the word "Tip:" and weight, and the mode chip keeps its shape. Holds.
- No red, amber only for almost up: the new `running-store` state is a plain line beside the Focus chip. Holds.
- Copy: "Welcome. Nothing to set up." and "F key opens Focus view, full screen or floating." are kind and plain. Holds.
- VoiceOver: the Kbd sr-only pattern is right. Hiding the tooltip Kbd glyphs leans on `aria-keyshortcuts`, which is only partly spoken by VoiceOver; see e-onboarding-14.
- Live region: the chip no longer announces. Holds, and spec A's "started, paused and resumed are not announced" is respected.
- Layout at 360×240: with the shape gone the message has the full row width; stacked running-store is chip (about 70px) + 8 + a 41-character line at 13px, within 336px. Measured fit is still owed to the layout test, which is now specified.

## Contrast re-run (contrast.py, light / dark)

Pairs touched by the fixes. Thresholds: text 4.5:1, UI marks 3:1.

| Pair | Use | Light | Dark | Need | Result |
|---|---|---|---|---|---|
| ink on surface | status line, "Tip:" word, sr text n/a | 13.23 | 14.54 | 4.5 | pass |
| ink-muted on surface | compact summary, 3c helper | 5.36 | 7.52 | 4.5 | pass |
| ink on surface-raised | Kbd text | 14.57 | 13.05 | 4.5 | pass |
| line-strong on surface-raised | Kbd edge | 4.79 | 4.99 | 3 | pass |
| ink-muted on surface-raised | No session chip in the time row | 5.91 | 6.75 | 4.5 | pass |
| focus on surface | "Got it" text | 5.31 | 8.74 | 4.5 | pass |
| focus on focus-soft | Focus chip in the status row (running-store) | 4.86 | 6.43 | 4.5 | pass |
| focus-ring on surface | focus outline on Today | 5.31 | 8.74 | 3 | pass |
| focus-ring on surface-raised | focus outline on the Settings row | 5.85 | 7.85 | 3 | pass |
| line-strong on surface | bar track (UI mark) | 4.35 | 5.56 | 3 | pass |

## Remaining findings

### e-onboarding-14 (minor, new) Tooltip Kbd glyphs now rely on `aria-keyshortcuts` being spoken

**Where:** `Window` tooltips (`.sp-kbd` is `aria-hidden`); Keys "Kbd (any)" row.

**Finding:** VoiceOver's reading of `aria-keyshortcuts` in Safari and WKWebView is partial and depends on verbosity. If it is not spoken, a VoiceOver user hears "Pause session" with no key, where a sighted person sees "Space". The tips still teach the two global keys by name, so nothing is lost on the first run; this is about the per-control tooltips.

**Fix:** Keep `aria-keyshortcuts` and verify it in the accessibility pass on a real device. If it is not spoken, give the tooltip Kbd the same sr-only name as the tip Kbd ("Space", "Command-Return", "Command-Period"). No canvas change now.

### e-onboarding-15 (minor, new) Stale comments and an unused class in `onboarding.css`

**Where:** `onboarding.css`: the `.ob-time` comment still says "Idle: chip + '25 min' in one row"; `.ob-mins` is unused; the `.ob-tipword` comment says "the shape and the word Tip mark it".

**Fix:** Delete `.ob-mins` and update the two comments to the fixed behaviour before the stylesheet becomes the reference for the design-system changes.

## Not verifiable from files

The fix report names dsChange entries (StatusRow, Kbd, IconButton and Tooltip). Those live in the Design type's store, not in the published files, so I did not read them. The same rules are written on the Tips, Keys and Deferred boards and in `onboarding.css`, which is what the design-system update will be built from.
