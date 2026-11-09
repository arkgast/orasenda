# Orasenda design pass: the redesign of 2026-11-09

- Date: 2026-11-09
- Scope: every screen group before sub-project B (Today, timer surfaces, Settings, tracking and blocking, planning, onboarding)
- Record: this review follows `01-fable-review.md` and `03-final-notes.md`. It records what was decided and why. It does not replace the design system artifact, which is the source of truth in design-first mode.
- Status: design only. No app code changed. The repo copy of `design/system/` was refreshed in this branch (commit 3965a1d) from artifact version 1794261511-11cc, which includes the eight scoped-check fixes (section 6.4). The latest artifact version at merge is recorded in `design/system/design-system.json` under `lastChange`. Items still owed are listed in sections 7 and 8.
- Supporting files: the briefs, the direction pick, the five group reviews, and the design-system changeset with its review are copied unchanged into [`04-redesign-pass/`](04-redesign-pass/). Links in this document point there. They were written in a session scratchpad, and this folder is their permanent copy.

---

## 1. Why

### Owner direction

The owner asked for five things:

1. **Today is minimal and responsive.** The timer is centred. Start, Pause, Resume and End are icon controls. Configuration lives elsewhere.
2. **The second-screen timer.** A timer can go full screen or float. The user chooses each time. Nothing is remembered.
3. **Notifications are off by default**, with a toggle. The permission is asked only when the user turns the toggle on.
4. **Settings comes sooner.** Theme, timer presets, notifications and keyboard need a home now, not in a later phase.
5. **Tracking and blocking** need a clear presentation of which apps and sites are covered and why.

The owner also asked what "Just 2 minutes" is for. Starting is often the hardest step, and a two-minute session is small enough to say yes to without planning. It matters most for people with ADHD. Once a session has started, most people keep going past the two minutes. It is the quiet secondary action beside Start, never a second primary. The purpose sentence is written into the StartButton README (section 6.2).

### Known issues

- **#119, "Today: Start can fall below the 900×600 window".** At the default size the idle Start pill sat below the bottom edge. The notice and the Custom fields pushed it down, and the scroll was hidden. The fix is structural. The ring is fluid and takes the spare space. Controls never move. One-shot messages go in a reserved status row of fixed height.
- **#120, "Today: make a refused Custom start visible where the user is looking".** A refused start was almost silent. The status row now carries it, with a shape and a word, next to the controls the user is using.

---

## 2. Process

1. **Audit and brief** (opus). The audit read every screen, the design system, the Tauri and Rust code paths, and `docs/SPEC.md`, `docs/ROADMAP.md` and the ADRs. It produced the brief, [`01-brief.md`](04-redesign-pass/01-brief.md).
2. **Critique** (fable). The critique, [`02-brief-critique.md`](04-redesign-pass/02-brief-critique.md), verified the audit's code claims. It returned "approve with changes". It named two blockers and several majors. One blocker: native macOS full screen can black out the other displays when "Displays have separate Spaces" is off. The Focus view changed to a borderless window sized to the display frame. The brief was revised after this review.
3. **Three Today directions** were drawn as canvases (section 3).
4. **Pick** (fable). Direction A was chosen, with graft items from the other two ([`03-direction-pick.md`](04-redesign-pass/03-direction-pick.md), section 4 here).
5. **Five screen groups** were each designed on one canvas, reviewed, fixed and re-reviewed. Each group had a first review with findings, a fix round on the same canvas, and a second review. The five group reviews are [`review-a-timer.md`](04-redesign-pass/review-a-timer.md), [`review-b-settings.md`](04-redesign-pass/review-b-settings.md), [`review-c-tracking.md`](04-redesign-pass/review-c-tracking.md), [`review-d-planning.md`](04-redesign-pass/review-d-planning.md) and [`review-e-onboarding.md`](04-redesign-pass/review-e-onboarding.md). Section 5 gives the results.
6. **Design-system changeset** (opus). The changeset, [`04-ds-changeset.md`](04-redesign-pass/04-ds-changeset.md), collected every token and component change the five groups asked for. It reconciled 121 proposals into 24 resolved conflicts, 26 new tokens, 22 changed tokens, 17 new components, 17 changed components and 34 README rules. Fable reviewed it, in [`04-ds-changeset-review.md`](04-redesign-pass/04-ds-changeset-review.md), and approved it with changes. The changes were applied to the live artifact first, as design-first mode requires. The artifact was republished as version 1794260898-f16f. A scoped check of that version approved it with eight minor findings, which were fixed in version 1794261511-11cc (section 6.4).

Every canvas was drawn but not rendered or screenshot-checked, by design. Real-font layout is owed to the Playwright layout test (section 7).

---

## 3. Directions considered

| Direction | Canvas | Principles | Productivity | Verdict |
|---|---|---|---|---|
| A: Still Point | https://claude.ai/artifact/PCgq6TwYj2PDtjRw2YYqea | 9 | 8 | Chosen |
| A2: centre Start | https://claude.ai/artifact/5hrrbc3JCwP3xo8NMgN6vo | 7 | 8 | Not chosen; centre Start disc rejected, three ideas grafted (section 4) |
| C: Horizon (strip layout) | https://claude.ai/artifact/AmzaQXPBw3pLboPo1ePg9h | 8 | 7 (9 in its niche) | Kept as the strip layout |

**A, Still Point.** The ring is a timer and never a control. The idle state keeps its word ("No session") and its shape (a hollow circle). Start is the design system's own 52px pill with the word and a play glyph. Pause, Resume and End are icon controls with tooltips on hover and focus. Amber appears only with the triangle and "Almost up". Nothing uses red. The layout fixes #119 by construction: four tracks, one of them flexible, a reserved 44px status row, configuration off the screen, no page scroll.

Reasons for the choice:

- A is the only direction with no principle cost. The screen is empty apart from the time and one action.
- A and A2 are equal on friction where it matters. Starting is one keystroke from anywhere. The preset is one line away. Configuration is off the screen.
- A wins on re-orientation. Start, Pause, Resume and End share one fixed row. A person with ADHD learns one place and does not hunt for the button.
- A has the lowest build risk. It changes structure (grid, fluid ring, status row) rather than components.

**A2, centre Start.** A circular Start button sits in the ring's centre while idle. The reviewers scored it well on Fitts reasoning but poorly on principles. The disc covers the idle "No session" word, so the idle state loses its visible word. A filled disc of up to 240px is the loudest object in the app, on the screen that must stay almost empty. The ring reads as two things. Once running, Pause sits below the ring, so the user learns two places for controls. Keyboard and global shortcuts already give the same speed, so the gain was small.

**C, Horizon.** This is not a second main screen. It is the layout Today needs when the window is a strip: digits, a horizon bar and a control column. It is the best option for a strip under a monitor. As the main screen it scores lower, because a linear bar is a weaker cue than a draining ring. The reviewer's own notes said so.

### A note on how these alternatives were made

The critique folded the original "Dial" direction into A as A2, a variant of A. It also narrowed C to a strip layout. So the three canvases are not three independent directions. A2 and A share one structure, and C is a layout for one window shape. The comparison tests one choice (where Start sits and how the window changes shape), not three full concepts. The pick should be read with that in mind.

---

## 4. The choice and the graft list

Direction A was chosen. These items were grafted from the other two:

1. **From C: the strip layout and the minimum.** Today switches to the three-column strip when the content box is wider than twice its height and under 420px tall. It switches to the stacked strip under 360 tall and under 640 wide. The window minimum became 360×240. The default stays 900×600. The switch happens on resize only, never on a tick.
2. **From C: paused wording.** The chip is the only "Paused". Two state words on one screen were rejected. The pick's wording was "Classic · 18 min left". The final wording is "Classic · 25 min" while paused, and "Classic · ends 15:20" while running. The timer review changed the paused wording so that the time left appears only once, in the digits (a-timer-5, rule 9).
3. **From A2 and C: a visible Pause and Resume target.** The 52px circle gets a `surface-raised` ground and a `line-strong` edge, so the target is visible and not only the glyph.
4. **From A2: a tooltip on the preset summary** ("Change preset") on hover and focus. The P key cap shows only while single-key shortcuts are on (cs-1), so the shortcut is discoverable when it works. The row-budget overlay from A2 became the model for the layout test assertions.
5. **From A2 and C: drawn states.** The Start loading state ("Starting…"), the denied-notification state with "Open System Settings", and the Settings keyboard section were drawn in both themes.
6. **From C: the triangle at the bar's end** is the model for the strip. On the ring the chip's triangle already does this job.

Must-fix items from the pick, before code:

- A `duration-slow` token for the two-minute fade into amber. It is now in the changeset (1600ms on `easing-calm`, removed under reduce-motion).
- Spec copy only in the status row. The invented store line was removed.
- A hidden `h1` ("Today") for focus after a page change.
- The 360 idle row measured with real fonts. This is still owed (section 7).
- One menu model. Navigation and commands use native menus. The preset popover is in the webview because it carries radios and a heading.
- Window tokens updated (section 6.1).
- Contrast for the new pairs. The changeset re-ran every relied-on pair (section 6.4).

---

## 5. Screen groups

Each group was reviewed once, fixed on the same canvas, then re-reviewed. "First verdict" is the verdict of the first review. "Final verdict" is the verdict after the fix round.

| Group | Canvas | Findings in round 1 | First verdict | Final verdict |
|---|---|---|---|---|
| Timer surfaces (Today's ring, Full screen, Floating, menu bar) | https://claude.ai/artifact/9pNxL32QEEq66j5QyAW1GX | 12 | approve with changes | approve |
| Settings | https://claude.ai/artifact/GrTgYRHtYxbKh7RVBpbQn1 | 10 | approve with changes | approve |
| Tracking, blocking and recent apps | https://claude.ai/artifact/66E6UxNb3GqCzopeqGAZad | 17 | approve with changes | approve with changes |
| Planning screens | https://claude.ai/artifact/Jjch1S2VvvL1bGKUoHJERp | 19 | approve with changes | approve |
| Onboarding | https://claude.ai/artifact/XPG6fXqiVfT8y1gTxpzKoz | 13 | approve with changes | approve |

Notes per group:

- **Timer surfaces.** The floater has a real idle state: a hollow circle, "No session", the Start pill and Open Orasenda. It no longer says "Session ended." before any session. The floater's minimum is 280×56 (was 248×56), its default 280×64 and its maximum 360×96. Scripted contrast failed two floater-edge pairs on a mid-grey wallpaper (1.23 and 1.25). The edge there is decorative, and the fill carries the boundary. The round-2 re-review showed that in all six theme × wallpaper combinations at least one of the fill and the edge holds 3:1. The changeset check confirmed this.
- **Settings.** One scrolling page with a section index, not a drill-in, below 640×480. The unavailable line is "Orasenda can't save settings right now. Changes you make here may not be kept." with "Try again". It covers both the write failure and the launch-time read failure.
- **Tracking, blocking and recent apps.** Strong lock wording depends on the helper. Without it the line says "quitting Orasenda ends it". With the helper approved it says that quitting reopens it, and that turning off the helper in Login Items ends it. The final verdict is "approve with changes" because of four minor findings listed in section 5.1. The contrast script found one failing pair, which was fixed.
- **Planning screens.** Every planning page uses one frame: a 44px header with the primary at its end, a reserved 44px status row, and one region that scrolls inside itself. The page never scrolls. Step flows have a fixed 52px footer. Two contrast pairs were documented as non-pairs (a former goal tick no longer drawn, and a decorative hairline).
- **Onboarding.** No onboarding screens. Today is the first run. Start focus holds keyboard focus on launch, so Return starts the first session. The first-run defaults are Classic 25/5, the system theme, notifications off, tracking off and ⌃⌥F on. The welcome line is "Welcome. Nothing to set up." in the status row. It has no action, is cleared by the first Start, and is never shown again. The shortcut is taught once after the first session ends, and Focus view once after the second.

### 5.1 Minor findings carried forward

These are not blockers. They are recorded here so they are not lost. The status column reads against the changeset review ([`04-ds-changeset-review.md`](04-redesign-pass/04-ds-changeset-review.md)) and the changeset itself ([`04-ds-changeset.md`](04-redesign-pass/04-ds-changeset.md)):

- **Absorbed into the design system:** the change is in the changeset and the republished artifact.
- **Routed:** the fix belongs to a spec or a canvas, and the changeset names where.
- **Owed to a test or device pass:** nothing can be closed on the canvas.
- **Open:** no fix is recorded yet.

| ID | Group | Finding | Status |
|---|---|---|---|
| a-timer-13 | Timer surfaces | The menu bar board's headers still read "18 minutes left" at 18:42. The board's own rule says header minutes round up, which gives 19. The rule and the drawing disagree. | Absorbed into the design system |
| a-timer-15 | Timer surfaces | The contrast note says the edge holds on a light desktop. That is true in the light theme (4.15) only. In the dark theme the edge is 2.71, and the fill (13.52) carries the boundary. | Absorbed into the design system |
| a-timer-12 | Timer surfaces | Real-font measurement is now specified as the Playwright WebKit layout test. Nothing was measured on the canvas. | Owed to the layout test (section 7) |
| b-settings-11 | Settings | When settings cannot be read at launch, the About row still shows "38 focus sessions, since 2 November." The count is not known in that case. | Absorbed into the design system (8.3, "Store unavailable") |
| b-settings-12 | Settings | "Try again" appears in two places that retry different things. The labels must say what each one retries. | Absorbed into the design system |
| c-tracking-18 | Tracking | The compact Apps and sites view shows the strength choice but none of the four helper rows. A small window can select Strong lock and never be offered the helper. | Routed to the tracking canvas (changeset section 10) |
| c-tracking-19 | Tracking | The compact "Add as" select hides its label, while the controls table says it has a visible label. The select rule should be written from that table. | Absorbed into the design system |
| N1 | Tracking | The Strong lock sentence is keyed on the helper state, not on the chosen strength. The README rule must key the sentence pair on helper approval alone. | Absorbed into the design system |
| N2 | Tracking | A few raw values remain in the mock's inline styles (a 3px margin, a 17px heading, scrollbar offsets). The type shorthands live in the canvas CSS, not the token sheet. | Absorbed into the design system |
| d-planning-20 | Planning | The 900×600 caption gives "about 252px" for each open column. The arithmetic gives about 204px. | Open. A canvas caption; not in the changeset |
| d-planning-21 | Planning | Weekly review step 3 places deep blocks with no task source. Week has no tray by design, so the step has nothing to place. | Routed to the planning spec (changeset section 10) |
| d-planning-22 | Planning | The compact Day picker lists both "Today" and "Mon 9 Nov, today". Two entries for one day. | Absorbed into the design system |
| e-onboarding-14 | Onboarding | Tooltip key glyphs are hidden from VoiceOver, which relies on `aria-keyshortcuts`. VoiceOver in WKWebView speaks this only partly. | Owed to the device pass (section 7) |
| e-onboarding-15 | Onboarding | The onboarding CSS has stale comments and an unused class from the pre-fix design. | Open. A canvas file; not in the changeset |

The eight findings from the scoped check of the republished design system (art-1 to art-8) are in section 6.4. They are fixed in version 1794261511-11cc.

---

## 6. Design-system changes

The changeset was applied to the live artifact (https://claude.ai/artifact/Sk5N75HzRwY8v7dBxhsH73), republished as version 1794260898-f16f. The scoped-check fixes followed in version 1794261511-11cc. The repo copy in `design/system/` was refreshed from that version in this branch (commit 3965a1d). The latest artifact version at merge is recorded in `design/system/design-system.json` under `lastChange`.

### 6.1 Tokens

- **New size tokens.** 24 size tokens for the layout constants that the screens need, such as the layout thresholds (`layout-compact-width`) and the floater sizes (`floater-min-height`).
- **New duration.** `duration-slow`, 1600ms on `easing-calm`. It is for colour changes that mark a time milestone, such as the two-minute fade into amber. It is removed under reduce-motion.
- **New type style.** `kbd`, 12/16/400, tabular, for key caps.
- **Window tokens.** `window-min-width` 360px (was 900px). `window-min-height` 240px (was 600px). The default window stays 900×600. The Settings compact threshold is one rule everywhere: below 640 wide or 480 tall.
- **Changed usage text.** `timer-sm` is the small mono style for small clocks and durations: the compact MenuBarTimer inside a planning session slot, the wall clock in TimerRing and FullScreenFocus, the NowLine label, calendar hour labels and durations in rows. It is not the macOS menu-bar item, which is plain system text since #86. The usage text was corrected in the token and in the README's Type paragraph. The type group is renamed from "Timer" to "Mono".
- **Changed usage text.** `caption` moved hour labels to `timer-sm`. `hit-floor` gained the scrollbar thumb minimum and the "More below" row. `body-sm` and `ink-muted` were clarified.
- **Colour values.** None changed. Every colour token has light and dark values, and they are byte-identical to the repo copy.

### 6.2 Components

- **New (17).** Including PageFrame (header 44, status row 44, one scrolling region), ScrollRegion (hairline when scrolled, a "More below" row, a stable gutter), Select (native, on `surface-sunken`), AppRow and AppPicker (a row per app or site, with a role tag and a search field), BarRow (one fill, no track, except the goal variant), Tooltip, FloatingTimer and TimerStrip (the strip layout). The remaining new components are in the changeset.
- **Changed (17).** Including TimerRing (a fluid `size`), StartButton (a play glyph, a `compactLabel`, an `unavailable` state, and the "Just 2 minutes" purpose sentence), FullScreenFocus (an IconButton for leaving, a caption that depends on the single-key setting, a borderless window), MenuBarTimer (the minute rule, the "Orasenda," prefix), NavRail (roving focus, the Pages button), InlineNotice (`variant="row"`, a fixed priority order), Input (the `alert` glyph, no hidden label), Choice (segmented and long), EmptyState (inline), IntentPrompt and Dialog (a `safe` variant).
- **Icons.** Errors and "needs you" lines use an `alert` glyph (an outlined circle with a bar and a dot). The amber triangle is kept only for Warning, meaning time almost up and a work-in-progress limit reached. A neutral line carries no shape.

### 6.3 Rules

- 34 new or rewritten README rules, in sections Layout (1–5); Colour (6); States (7–9); Motion (10); Iconography (11–13); Keyboard and menus (14–21); Pages and flows (22–29); Voice (30–34).
- **Single keys.** Copy never promises a single key that a setting can turn off. With single-key shortcuts off, tooltips and tips drop their key cap. The control stays reachable by Tab.
- **No single keys on Settings.** Single-key shortcuts never exist on Settings or on any page with text fields. A list may act on a letter key only while a row has focus, and only if the rule says so. The AppRow letter key was dropped for this reason.
- **Esc order.** The Esc precedence rule was extended to cover every Esc behaviour the changeset defines.
- **Copy.** The status row's store lines come from spec A, word for word. No new store line was invented. The copy table lives on the canvases and in the changeset.

### 6.4 Scoped check of the republished version

The scoped check (fable) read every path the changeset touched and compared them with the repo. Every item was applied. Nothing outside the changeset changed. Contrast was re-run by script against the live tokens, and every relied-on pair reproduces. The check approved the version with eight minor findings. None needs a token or a new drawing. All eight are fixed in version 1794261511-11cc:

- **art-1 (fixed).** Previews of changed components showed the old behaviour. For example, the StartButton preview showed the finish time under the button.
- **art-2 (fixed).** The `hit-floor` text lost "and the menu-bar timer". The change is recorded in the changeset, section 3.2 (`hit-floor` row).
- **art-3 (fixed).** The "Built in" tag on AppRow reused the shield glyph of "Always allowed". It is now word-only.
- **art-4 (fixed).** The PopoverMenu preview mixed two states. It now shows the idle and read-only panels separately.
- **art-5 (fixed).** IconButton says Pause and Resume are `round`. Two compositions used `md`, and the README wording now matches.
- **art-6 (fixed).** InlineNotice's first bullet predated the `attention` tone. The README wording now matches.
- **art-7 (fixed).** StartButton's `disabled` was still typed and previewed, but no longer documented. It was dropped.
- **art-8 (fixed).** AppPicker's inset focus ring is now documented.

The first review of the changeset raised 19 findings (cs-1 to cs-19). The scoped check confirmed that the READMEs now carry their fixes. Two of them are worth naming: the single-key caption rule (cs-1) and the rule that a floater never uses the strip (cs-2).

---

## 7. Not yet verified

Nothing in this pass was rendered, screenshot-checked or run in an app. Every layout number is calculated.

- **Real-font layout in WebKit.** Atkinson Hyperlegible Next and Lexend must be measured in WKWebView. The Playwright WebKit layout test is required by the next spec and gates the first code change. It was not run. Its case list is the "Pages never scroll; regions do." bullet under Layout and hit targets in `design/system/README.md`, which is the source; this section does not restate it in full. That bullet covers at least: windows 360×240, 360×360, 640×330, 640×480, 900×240, 900×600, 1440×900 and 3440×400; the Focus window at 1280×720 and 1920×1080; and the floater at 280×56, 280×64 and 360×96 in every state (running, paused, warning, idle, ended, deep). The cases are the longest status line beside the widest action ("Open Settings"), the stacked strip running (chip plus a two-line store line), a status row exactly 44px, and `scrollHeight <= innerHeight` on Today, Focus and Floating. Planning adds Board, Calendar, Routines, Review and ⌘K at 360×240, 900×600 and 1440×900 ([review-d-planning](04-redesign-pass/review-d-planning.md), section 4). The idle row at 360 wide is estimated at 316 of 328px. If it wraps, the pill reads "Start", and the accessible name stays "Start focus".
- **VoiceOver** on a running build. Including the composed recorder name and the key glyphs in tooltips.
- **Native menus and the status item.** The NSMenu and NSStatusItem appearance is drawn as token stand-ins.
- **Final icons.** The rail, Focus view, leave and open glyphs are placeholders. The final set must be in the design system before the app uses it.
- **Contrast.** `verification/contrast.py` does not exist in the repo yet. The contrast numbers were computed by script for this pass, not by the repo's check. Wallpaper pairs were computed for mid-grey, light and dark only.
- **Forced colours and Increase Contrast.** Not drawn.
- **Reading comfort (Lexend) and localised copy lengths.** Not measured.
- **Remaining notCovered items, by group.**
  - Timer surfaces: break states from sub-project B (the break arc, Skip break); the Default preset error state, whose copy is not in spec A; task and intent inside the ring (P2, B); the floater's drag behaviour and per-display frame memory beyond the written rules.
  - Settings: the full Apps and sites screens (tracking and blocking) belong to their own canvas; Settings shows only the interim line. Sub-project B rows (long break, rounds, flow-extension cap, two-minute notification) and D's capture shortcut ⌃⌥N are not drawn. The 900×240 strip uses the compact 360×240 layout and is not drawn separately. The state-frame scroll positions are set by a script on mount, and the runtime may ignore them. The ⌘K palette, app menu and menu-bar menu are stand-ins. Windows settings and onboarding are not covered.
  - Tracking: profiles, the "Strength for" select, user-chosen emergency contacts, the macOS Focus filter setup, the browser extension install flow, and the "Add site" picker result are not drawn. Review's usage week view, the export format choice and the reasons list are not drawn. The menu-bar "Pause recording" item is not drawn. Reduce-motion is stated but not drawn. Subgrid (BarRow) and `:has()` (focus styles) need WebKit 16 or later, and the minimum supported macOS must be checked. Whether the backend hides the app when the overlay fails is unknown. The Strong lock states may change with the open anti-quit spike (ADR-004).
  - Planning: the task detail editor, block editor, Delete task dialog, Filter menu, Calendar date popover, drag and drop states, Calendar with external events, the full usage list, routine editing, reading comfort and forced colours. The copy table is on the canvas only and is not yet in `docs/specs` or the design system README. The canvas is private until the owner shares it. TaskCard's on-select prop is ignored by the current bundle, so the hover state is drawn with a specimen-only wrapper.
  - Onboarding: the P3 setup steps (wake time, default preset, morning template). The 900×240 strip and other ultrawide onboarding states. The full Settings screens (General, the keyboard recorder, Apps and sites); only the Notifications row is drawn. The tracking and blocking opt-in flow. The menu bar and floater during the first session (drawn in the timer group). Measured fit at 360×240 is specified but not measured. Behaviour when the window is first closed during the first session. The brief's Q4 migration for `notify.session_end` is referenced, not restated.
- **Spec A amendment.** The changeset's section 10 lists the spec A contract changes that the canvases made. They are on the Calls board but are not yet written into `docs/specs`. The repo was read-only in this pass.

---

## 8. Next steps

1. Fix the open findings first in the canvas, then in the repo copy where they apply. These are d-planning-20 (planning canvas caption, "about 204px") and e-onboarding-15 (onboarding canvas CSS comments). Any artifact change must be republished and the repo copy refreshed in the same change.
2. Write the Playwright WebKit layout test before the first code change of Today. It also covers a-timer-12. The device pass for e-onboarding-14 comes with the accessibility pass.
3. Write the spec A amendments from the Calls board into `docs/specs`.
