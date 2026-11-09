# Orasenda design system: reconciled changeset from the redesign pass

- Date: 2026-11-09
- Author: design-system lead (opus)
- Inputs: `04-groups.json` (121 proposed `dsChanges` across five groups: a-timer 27, b-settings 23, c-tracking 22, d-planning 39, e-onboarding 10, plus each group's `remaining` minor findings), `03-direction-pick.md`, `review-*.md`, and the repo copy `design/system/` (README.md, tokens.json, 26 component READMEs) at `main` 04d8c3a.
- Contrast: every pair below was run with `contrast.py` logic against a temporary copy of tokens.json (`04-tokens-tmp.json`, which only adds three wallpaper fixtures). Raw output: `04-contrast-run.txt`. No new colour token is needed.
- Apply order (CLAUDE.md, design-first): read the live artifact https://claude.ai/artifact/Sk5N75HzRwY8v7dBxhsH73, apply sections 3 to 7, republish, then refresh `design/system/` from it in the same PR. Every new or changed component and token below has its README or usage text written out here.

## 0. Summary

| Kind | Count |
| --- | --- |
| New tokens (24 size, 1 duration, 1 type style) | 26 |
| Changed tokens (usage or value; plus the type group rename "Timer" to "Mono") | 22 |
| New components | 17 |
| Changed components | 17 |
| README rules (new or rewritten) | 34 |
| Conflicts resolved | 24 |
| Proposals rejected or routed elsewhere | 12 |

121 proposals collapse to these because many groups proposed the same thing (ScrollRegion three times, IconButton and Tooltip four times, the window minimum four times, permissions-at-the-moment-of-need four times, the status row three times).

---

## 1. Conflicts resolved

Each line: what disagreed, the pick, and why.

1. **Scrollbar token: `scrollbar-size` 10px (b, d) vs `scrollbar-width` 8px thumb (c).** Pick one token, `scrollbar-size` 10px (the track). The thumb is derived: 10px minus a 2px inset on each side = 6px, which is what d and b drew. `scrollbar-width` is rejected: it is also the name of a CSS property, which invites a wrong `var()`. The thumb's minimum length is `hit-floor` (24px), not b's `hit-min`: the keyboard scrolls the region (focused items and the focusable region itself), so the thumb is not a required target and a 44px floor would only shorten the scroll range in a 96px region.
2. **ScrollRegion defined three ways** (b: hairline where scrolling starts; c: "More below" edge row; d: stable gutter). Pick all three behaviours in one component: a `line` hairline at the top once scrolled, a "More below" edge row while content remains below, `scrollbar-gutter: stable`. They do different jobs (where you are, that more exists, no layout shift) and none conflicts with another.
3. **Page frame: b's SettingsPage (44 header, 44 save line, body), c's SettingsPage (auto header with title, helper and primary), d's PlanningPage (44 header, 44 status row, region).** Pick d's frame for every list page, named `PageFrame`, with Settings' save line as its status row. c's auto-height header is rejected: a header that grows moves the primary and eats the 240px budget. c's page helper moves to the top of the region and scrolls with it.
4. **Settings compact model: b's single page with a "Jump to section" menu vs c's drill-in (section pages with Back) below 800 wide.** Pick b. One scrolling page with an index is one level of navigation instead of two, nothing hides behind Back, and it matches "compact never drops a control". The drill-in and its Back IconButton are rejected for Settings.
5. **Compact threshold for Settings and Review: global 640×480 (a, b) vs a page-level 800 wide (c).** Pick one threshold everywhere, 640×480. Between 640 and 800 wide the Settings content column is about 262–420px; AppRow wraps its RoleTag under the name below 360px of row width (written into AppRow) so the rows still fit. One threshold is one thing to test.
6. **Review compact model: c's drill-in vs d's "native Select replaces the title".** Pick d's Select for Review (Period) and every planning page; it is the pattern the planning canvas drew for all four pages. SegmentedChoice stays only for switching between parallel lists inside a page.
7. **Settings section list: b (six, with an interim Apps and sites and "About and data") vs c (eight: … Apps and sites, Privacy, Data, About).** Pick: General, Timer, Notifications, Keyboard, Apps and sites, Privacy, About and data. Privacy appears only when tracking ships; until then Apps and sites shows b's interim EmptyState line. "Data" and "About" stay merged (b): c's Privacy already holds usage export and deletion, so a separate Data section would hold one row.
8. **"Add apps" as the header primary (c) vs "Settings has no primary" (b).** Pick b. Under conflict 4 Apps and sites is a section of the Settings page, which saves on change and has no primary. "Add apps…" becomes a quiet button in that section, and the AppPicker's "Add N apps" is the primary inside its dialog.
9. **Neutral bar: c's NeutralBar (fill `ink-muted`, no track) vs d's BarRow (fill `line-strong`, `line` hairline track).** Pick one component, `BarRow`, fill `line-strong`, no track. `line-strong` is the neutral mark; `ink-muted` as a mark means paused or shallow (the paused arc and strip fill, the hollow shapes), and bars are neither. The goal bar is the one variant with a track (a `line` hairline, decorative) because it shows a part of a whole. Both pass 3:1 (section 9).
10. **Usage bars "never focus" (c) vs the goal bar "fills focus" (d).** Both stand, scoped: `focus` fills only the focus-time goal bar, because it measures Focus sessions (the mode the hue means). Bars about apps, roles or anything else are neutral.
11. **The triangle for errors (b: "the triangle in ink means this needs you"; current Input README) vs "mode shapes are reserved for modes" (c).** Pick c and take b's own "revisit a distinct error glyph": errors and "needs you" lines use the `alert` glyph (outlined circle with a short bar and a dot, 14px, 1.5 stroke, `ink`). The triangle stays only for the Warning mode: time almost up and WIP at limit. This changes Input, the status row, SettingsIndex and ShortcutRecorder.
12. **Status-row shapes: b's check shape on "Saved." vs e's "neutral lines carry no shape".** Pick e. The word "Saved." carries the state; a check would be a second meaning for the done check. Three tones only: neutral (no glyph), attention (alert glyph), warning (amber triangle, time only).
13. **Status-row priority: spec A (one-shot milestone, otherwise the store line) vs a and e ("store line takes the row first").** Pick neither alone: the row holds up to two sentences, so a one-shot line and the standing store line are joined ("Session ended. Orasenda can't save sessions right now."), as e already does for tips. Order in section 8.
14. **Store copy: spec A "Orasenda can't save sessions right now." (a, e) vs b's shared "Orasenda can't save right now." + a page clause.** Pick the pattern "Orasenda can't save <thing> right now." + an optional clause. Today keeps spec A's line verbatim (no spec change, and it fits two lines at 360 wide); Settings reads "Orasenda can't save settings right now. Changes you make here may not be kept." It also matches planning's "Orasenda can't load <thing> right now."
15. **Popover models: a's preset PopoverMenu (radio rows) vs c's role menu (menuitemradio with the word "Current").** Pick one PopoverMenu with one ARIA model: `role="menu"` with `menuitemradio`, `menuitemcheckbox` and `menuitem`. The checked radio shows the Choice radio shape (circle with a filled `focus` dot) on the `selection` ground. The word "Current" is dropped: the dot is the non-colour cue in both menus and matches Choice.
16. **Preset popover running copy: "Changes apply to your next session." (a States board, round 1) vs "Presets can change between sessions." (a round-2 fix).** Pick the round-2 line.
17. **Select label: "native select with a visible label" (c Controls table) vs an sr-only "Add as" in compact (c canvas) vs "compact picker replaces the title" (d).** Pick: a Select always has a visible label, with one exception, the compact page picker, whose label is visually hidden because its value is the page title. "Add as" is visible in compact too.
18. **Hour labels: "caption, mono" (d) vs `caption` being a sans style.** Pick `timer-sm` (mono 13/16) in `ink-muted` for hour labels. The README says every clock is mono, and 13px reads better than 11px. "09:00" needs about 40px of the 52px `hour-gutter`.
19. **Mono numbers in rows (durations, estimates, counts) were 13px mono at 16 or 18 line-height across canvases with no token.** Pick `timer-sm` for all of them; this is also the carry-over fix of its usage text (section 4).
20. **Kbd: 12/16 mono `ink-muted` with no ground (a, b canvases) vs 12/16 mono `ink` on `surface-raised` with a `line-strong` edge (e).** Pick e. Add a `kbd` type style so the 12px value is a token.
21. **Window minimum 360×240 and the stacked strip vs d's flow variant "drop the status row below 300 tall".** Pick a narrower rule: below `layout-short-height` (300) a flow's status row takes no height while empty, and takes its 44px from the region when a line exists. A message is never dropped; the space is not reserved when there is nothing to say. Timer surfaces keep their reserved row at every size.
22. **Floater size: 248×56 (old) vs 280×56 minimum, 280×64 default, 360×96 maximum (a round 2).** Pick a round 2; five tokens.
23. **`page-header-height` alias of `hit-min` (d) and `column-strip-width` alias of `rail-width` (d).** Reject the first (the header is `hit-min`; a second name for the same job is a duplicate). Keep the second as a plain 64px value: a folded column and the rail share a number by coincidence and must be free to diverge. Size tokens are plain values; aliases exist only in the colour group.
24. **Single-key shortcuts: on by default with a setting (a) vs "no single-key shortcuts on pages with fields" (b).** Both stand: Space, F and P exist only on Today, the Focus window and the floater, follow the setting, and never exist on Settings or any page with text fields (this includes focused-row letter keys such as an AppRow "M"; rule 14 would have to allow one explicitly first).

## 2. Rejected or routed elsewhere

| Proposal | Decision | Reason |
| --- | --- | --- |
| `scrollbar-width` 8px (c) | Rejected | Merged into `scrollbar-size` (conflict 1). |
| `page-header-height` (d) | Rejected | Duplicates `hit-min` (conflict 23). |
| Settings and Review drill-in below 800 wide (c) | Rejected | Conflicts 4 and 5. |
| Auto-height page header with helper (c) | Rejected | Conflict 3. |
| Check shape on "Saved." (b) | Rejected | Conflict 12. |
| Ink triangle as the error glyph (b) | Rejected | Conflict 11. |
| Word "Current" in popovers (c) | Rejected | Conflict 15. |
| "StepFlow word" as its own component (d) | Folded into PageFrame | It is one `body-sm` line in the header's end slot; a component would add an API for a string. |
| "Long choice" and SegmentedChoice as new components (c) | Folded into Choice | Both are native radios and checkboxes in a fieldset: reuse the existing component as variants. |
| Role menu popover as its own component (c) | Folded into PopoverMenu | Conflict 15. |
| Spec A amendment as a README rule (e) | Routed to `docs/specs` | It changes product behaviour (notification request, `notify.session_end` default, the status message as the live region). The README gets only the design rule; the spec text goes in the spec PR. Same for b's store-state table (#112) and the #120 spec line. |
| The full planning copy table with ids (d) | Routed to the planning spec | The README Voice section takes the copy patterns (section 7.8) and the status-row slots (section 8); 25 screen lines belong in the spec that owns those screens. |

Nothing proposed breaks a principle outright. The two closest calls were the triangle for errors (a mode shape reused for a non-mode; fixed by conflict 11) and BarRow's track (a `line` hairline that would have carried meaning; now decorative only on the goal bar, where the stubs and words carry the goal).

---

## 3. Tokens

### 3.1 New tokens

All size values are theme-independent.

| Group | Name | Value | Usage text |
| --- | --- | --- | --- |
| duration | `duration-slow` | 1600ms | The colour fade that marks a time milestone: the ring arc, the chip and the strip fill fading into `amber` at two minutes, always on `easing-calm`. The word and the shape switch at once; only colour fades. Instant under reduced motion. |
| size | `layout-compact-width` | 640px | Below this window width (or below `layout-compact-height`), a page is compact: no nav rail, a Pages IconButton instead, page pickers replace titles, the Settings index becomes Jump to section. |
| size | `layout-compact-height` | 480px | Below this window height a page is compact; see `layout-compact-width`. 640 × 480 is the smallest regular window. |
| size | `layout-strip-height` | 420px | Today and the Focus window switch to the strip layout when the content box is wider than twice its height and shorter than this. Switches happen on resize only, never on a tick. The floater never uses it: it is its own composition sized by the `floater-*` tokens and never changes layout by shape. |
| size | `layout-ring-min-height` | 360px | Below this content height the ring cannot hold its fixed tracks plus `timer-min-size`: the strip is used at `layout-compact-width` or wider, the stacked strip below it. |
| size | `layout-short-height` | 300px | Below this window height a step flow's status row takes no space while empty and takes its 44px from the region when a line shows. Never applies to timer surfaces. |
| size | `layout-tight-height` | 700px | Below this visible display height the IntentPrompt's step 2 and typed-reason step drop the breathing circle and the gap goes from `space-5` to `space-4`. |
| size | `timer-min-size` | 160px | Floor of a fluid TimerRing. The strip's digits never go below `timer-md`. |
| size | `floater-width` | 280px | Default and minimum width of the floating timer window; holds every state, including "Session ended." with Start and a 1:30:00 Deep Block. |
| size | `floater-height` | 64px | Default height of the floating timer window. |
| size | `floater-min-height` | 56px | Minimum height of the floating timer window. |
| size | `floater-max-width` | 360px | Maximum width of the floating timer window. |
| size | `floater-max-height` | 96px | Maximum height of the floating timer window. From 88px (2 × `hit-min`) the state word gets its own line. |
| size | `index-width` | 200px | The Settings section index. |
| size | `side-width` | 240px | Side lists: the Calendar's Unscheduled tray and the Routines list. |
| size | `field-width` | 220px | A labelled field with its helper (the minute fields); also the ShortcutRecorder's minimum width. |
| size | `number-width` | 120px | A number input before its unit suffix ("min"). |
| size | `column-min-width` | 200px | Narrowest an expanded kanban column gets; with two folded strips and `space-2` gaps, Doing, Today and Inbox stay open at 900 × 600. Pending the real-font TaskCard check at 200px. |
| size | `column-strip-width` | 64px | A folded kanban column (a strip with chevron, name and count). |
| size | `hour-gutter` | 52px | The hour labels beside day and week lanes (`timer-sm`, `ink-muted`). |
| size | `minute-scale` | 2px | Calendar height per minute: a 15-minute block is 30px, a 30-minute block 60px. |
| size | `scrollbar-size` | 10px | ScrollRegion's always-drawn scrollbar track. The thumb is inset 2px on each side (6px wide), `line-strong`, at least `hit-floor` tall. |
| size | `bar-height` | 12px | Thickness of a BarRow bar in Review and session summaries. |
| size | `picker-height` | 520px | Height of the AppPicker dialog in regular windows; never taller than the window minus `space-6`. |
| size | `popover-width` | 272px | Width of in-webview popovers: the preset menu and the role menu. |
| type (Mono group, renamed from "Timer"; family unchanged) | `kbd` | 12px / 16px, weight 400, tracking 0, tabular-nums, sample "⌃⌥F" | A key name in a Kbd: in tips, tooltips and captions. `ink` on `surface-raised`. |

### 3.2 Changed tokens

| Group | Name | Old | New value | New usage text |
| --- | --- | --- | --- | --- |
| size | `window-min-width` | 900px, "Scroll below it; never clip controls." | **360px** | Minimum app window width. The default window stays 900 × 600. Timer surfaces never scroll; list pages scroll only inside their ScrollRegion; nothing is clipped and no control is dropped at any size. |
| size | `window-min-height` | 600px, "and the full-screen layout floor" | **240px** | Minimum app window height. At 360 × 240 Today is the stacked strip and list pages keep a header, a status row and a region of at least 96px. |
| type | `timer-sm` | usage "Menu-bar timer and the NowLine label." | (13/16/500 mono unchanged) | Small mono numbers outside the large timers: the compact MenuBarTimer inside the SessionSlot on planning pages, the wall clock inside TimerRing and FullScreenFocus, the NowLine label, calendar hour labels, and durations, estimates and counts in rows ("0h 35m", "Est 3"). Not the macOS menu-bar item, whose title is plain system text. `ink` or `ink-muted` on every surface. |
| type | `timer-md` | "Floating mini timer and the full-screen wall clock." | (unchanged) | Digits in the floating timer and the floor for the strip's digits. `ink` or `ink-muted` on `surface` and `surface-raised`. |
| type | `timer-lg` | "Countdown inside the Today ring." | (unchanged) | Countdown inside the ring at `timer-size`. A fluid ring scales its digits with its diameter, never below `timer-md`. `ink` on `surface`. |
| type | `caption` | "… and calendar hour labels" | (unchanged) | Kanban counts, rail labels and the ScrollRegion "More below" row. `ink-muted` on `surface`, `surface-raised` or `surface-sunken`. Hour labels moved to `timer-sm`. |
| size | `timer-size` | "Default TimerRing diameter on Today." | (280px) | TimerRing diameter at the default 900 × 600 window. The fluid ring sizes to its track between `timer-min-size` and `timer-full-size`. |
| size | `timer-full-size` | "TimerRing diameter in FullScreenFocus." | (560px) | Largest TimerRing diameter: the Focus window on a large display. |
| size | `column-width` | "Width of a kanban column" | (280px) | Widest an expanded kanban column gets; columns are fluid between `column-min-width` and this. |
| size | `panel-width` | dialogs, capture pad, palette, toasts, routine rows | (420px) | Also the AppPicker's width and the cap of the All shortcuts table. |
| size | `content-width` | "on Today and in reviews" | (720px) | Maximum content width on Today, in reviews and in the Settings content column. |
| size | `control-lg` | "large Start button and nav rail items" | (52px) | Also the round Pause/Resume IconButton, a step flow's footer, an AppRow in regular windows and a Settings index item. |
| size | `hit-floor` | "compact calendar blocks and the menu-bar timer" | (24px) | Drop "and the menu-bar timer" (native since #86). Also the minimum length of the ScrollRegion thumb (not a required target, conflict 1), and the height of the "More below" row (not a target). |
| type | group `Timer` | group name "Timer" | renamed **Mono** (family `mono`, styles unchanged) | The group now holds `kbd` too. README Type paragraph: "Every countdown, clock and duration, and every key cap (`kbd`), is `--font-mono`…". |
| type | `body-sm` | "… ink-muted on every surface and soft tint." | (unchanged) | Metadata, helper text, notes, disclaimers and the status-row message. `ink` or `ink-muted` on every surface and soft tint. |
| color | `ink-muted` | "Secondary copy, helper text, disabled labels and paused timers …" | (values unchanged) | Secondary copy, helper text and disabled labels; as a mark, paused or shallow only: the paused arc and strip fill and the hollow mode shapes. On every surface and soft tint, at least 4.5:1. Never a neutral bar fill (that is `line-strong`). |
| size | `icon-md` | menu-bar shape, tick, radio dots, wellness glyph | (14px) | Also the role glyphs, the alert and info glyphs and the Select chevron. |
| size | `icon-lg` | "Nav rail icons" | (20px) | Nav rail icons, IconButton icons and app icons in AppRow. Line icons at 1.5px stroke. |
| color | `line-strong` | control borders, timer track, hollow dots, hatch | (values unchanged) | Marks that carry meaning: control borders, the timer track and the strip track, tooltip, popover, Kbd and floater edges, segment separators, the scrollbar thumb, BarRow fills, hollow habit dots, the overflow hatch. At least 3:1 on every surface and soft tint. |
| color | `amber` | "time almost up and WIP limit reached" | (values unchanged) | Adds: the strip's fill and end triangle when almost up. Still always with a triangle and a word. |
| color | `focus` | sessions, Deep work, primary, now bar, selected markers | (values unchanged) | Adds: the focus-time goal bar in Review and the visible word "Today" on today's week head. Never for app usage bars. |
| duration | `duration-calm` | "Mode changes, ring steps and chip colour changes." | (320ms) | Mode changes and ring steps. The two-minute colour change uses `duration-slow`. |
| z-index | `z-popover` | "Toasts and popovers above the rail." | (100) | Toasts, tooltips and in-webview popovers above the rail. |

The type group also gets a build change (remaining finding N2): the token sheet emits one CSS font shorthand per type style, `--type-<name>` (for example `--type-body-sm: 400 13px/18px var(--font-sans)`), so app code never writes a font size, line height or family.

---

## 4. The `timer-sm` carry-over fix

The usage text still says "Menu-bar timer and the NowLine label". Since #86 the macOS menu-bar item is a native `NSStatusItem` with a plain system-font title, so nothing in the menu bar uses `timer-sm`. After this redesign it is the small mono style for: the compact MenuBarTimer inside the planning SessionSlot, the wall clock in TimerRing and FullScreenFocus, the NowLine label, calendar hour labels (conflict 18), and durations, estimates and counts in rows (conflict 19). The new usage text is in section 3.2. Also fix the README Type paragraph, which lists `timer-sm` "in the `MenuBarTimer` component"; it should read "`timer-sm` for small clocks and durations (SessionSlot, NowLine, hour labels, rows)", and its opening becomes "Every countdown, clock and duration, and every key cap (`kbd`), is `--font-mono`" now that the group is named Mono (section 3.2).

---

## 5. New components

Each entry is the README outline. Every README states purpose, anatomy, props, states, keyboard, VoiceOver and do/don't.

### 5.1 IconButton

- **Purpose:** an action shown as an icon, always with a label in its Tooltip and its accessible name. Used for Pause/Resume, End, Focus view, Leave full screen, Pages, Jump to section, Close, Change role.
- **Anatomy:** native `button`; one 20px (`icon-lg`) line icon at 1.5 stroke; optional Tooltip.
- **Props:** `label` (required: the accessible name and the tooltip text), `icon`, `shortcut?` (shown as a Kbd in the tooltip and set as `aria-keyshortcuts`), `size: 'md' | 'round'` (`md` 44 × 44 at `hit-min`; `round` 52 × 52 at `control-lg`, `surface-raised` ground with a `line-strong` edge, used for Pause/Resume so the target is visible and not only the glyph), `onClick`, `disabled`, `aria-haspopup` when it opens a menu, native or PopoverMenu.
- **States:** rest (icon `ink`, clear ground; round: `surface-raised`); hover `surface-sunken`; pressed `selection`; disabled dashed `line-strong`, icon `ink-muted`, with a visible reason elsewhere (rule 7.4); focus ring 2px at 2px offset.
- **Keyboard:** Tab, Space, Return. Never more than one tab stop.
- **VoiceOver:** name = `label` exactly ("Pause session"); the shortcut is spoken through `aria-keyshortcuts`. No `title` attribute.
- **Do:** give every IconButton a label someone would say. **Don't:** use icons alone without a tooltip, or `aria-label` text that drops the visible label of anything else.

### 5.2 Tooltip

- **Purpose:** the visible name of an IconButton or the preset summary ("Change preset", with the P Kbd only while single-key shortcuts are on), on hover and on keyboard focus.
- **Anatomy:** `surface-overlay` panel, 1px `line-strong` edge, `radius-sm`, `body-sm` `ink` text, optional Kbd. It renders inside the nearest open dialog when its trigger is in one (a `showModal()` dialog sits in the top layer, which no z-index reaches); `z-popover` applies only outside the top layer.
- **Single keys:** a Kbd for a single key (Space, F, P) shows only while the Single-key shortcuts setting is on; when it is off the tooltip drops that Kbd (and the trigger drops that key from `aria-keyshortcuts`), keeping any ⌘ combination. The same applies to tips and captions (rule 14).
- **Props:** `label`, `shortcut?`, `placement` (auto, never covering the trigger).
- **States/behaviour:** opens after `duration-quick` on hover; opens on focus only after the window has seen a keyboard event (input-modality flag), because WebKit matches `:focus-visible` for programmatic focus (this keeps launch focus on Start from opening its tooltip). Stays while hovered (WCAG 1.4.13). Max width 40ch, at most two lines, never ellipsized; the Kbd never breaks. No motion under reduced motion.
- **Keyboard:** Esc hides it without moving focus, and only it (rule 7.25).
- **VoiceOver:** the trigger's name already says the label; the tooltip is `aria-hidden` and its Kbd glyph is `aria-hidden`. If device testing shows WKWebView does not speak `aria-keyshortcuts`, give the tooltip's Kbd the same hidden spoken name as a tip's Kbd (finding e-onboarding-14).
- **Do:** keep the text equal to the accessible name. **Don't:** put actions or links in a tooltip; use the native `title` attribute.

### 5.3 Kbd

- **Purpose:** a key name inline in a tip, a tooltip or a caption.
- **Anatomy:** `kbd` type style (mono 12/16), `ink` text on `surface-raised`, 1px `line-strong` edge, `radius-sm`, padding `0 space-1`.
- **Props:** `keys` (glyph string, "⌃⌥F"), `spoken` (required in running text: "Control-Option-F", "Command-Return", "F key").
- **States:** none; it is never a control.
- **VoiceOver:** the glyph is `aria-hidden`; in running text a visually hidden sibling carries `spoken`; in a tooltip the trigger's `aria-keyshortcuts` speaks it.
- **Do:** always pass a spoken name in text. **Don't:** style a Kbd as a button or make it focusable. Replaces the ad hoc `sp-kbd`, `ob-kbd` and `hz-tip kbd` styles.

### 5.4 TimerStrip

- **Purpose:** the time on Today and the Focus window when the window is a strip (section 7.1). The floater does not use it (FloatingTimer, 5.5).
- **Anatomy:** digits (`timer-lg` scaled, floor `timer-md`, `ink`) over a horizon bar in a 10px box: a 2px `line-strong` track and a 6px fill showing time left (a third, as in the ring, so the fill end reads by thickness, not colour), plus a 10px `amber` triangle at the fill's end when almost up.
- **Props:** as TimerRing (`remaining`, `remainingLabel`, `progress`, `mode`), `idleLength` ("25 min").
- **States:** focus (fill `focus`); paused (fill `ink-muted`, frozen); warning (fill `amber` plus the triangle; the colour fades over `duration-slow`); idle (no bar, `idleLength` in `ink-muted` at `timer-md`, never fake digits).
- **Keyboard:** none; it is not a control.
- **VoiceOver:** `role="timer"`, `aria-live="off"`, name from `remainingLabel`, as TimerRing.
- **Do:** keep the chip as the state word beside it. **Don't:** let the digits shrink below `timer-md`, or colour the track.

### 5.5 FloatingTimer

- **Purpose:** the always-on-top mini window that keeps time visible over other apps.
- **Anatomy:** MenuBarTimer `compact: false` plus Pause/Resume and Open Orasenda IconButtons, always visible; `surface-raised` fill, 1px `line-strong` edge in both themes, `shadow-raised`; drag region on the body. From 88px tall the state word sits on its own line. It is its own composition sized by the `floater-*` tokens and never switches to the strip layout or changes layout by shape.
- **Props:** MenuBarTimer props plus `onPause`, `onResume`, `onStart`, `onOpen`; sized by `floater-*` tokens.
- **States:** running; paused; warning; idle (hollow circle, "No session" in `ink-muted` `body-sm`, a Start pill with the play glyph and "Start" at `space-3` padding in Pause's slot; accessible name "Start focus"); ended (same as idle with "Session ended." announced once); deep (1:30:00 fits at the minimum).
- **Keyboard:** Tab through the controls; the native context menu has Close (Hide floating timer) and, while idle or ended, Start focus.
- **VoiceOver:** group named "Floating timer, <state>" ("Floating timer, No session").
- **Do:** measure control contrast against the floater's own fill. **Don't:** add a task title at the minimum size or a close button inside the panel (closing lives in the context menu and the menu bar).

### 5.6 PopoverMenu

- **Purpose:** the one in-webview menu, for a choice that needs radios and a heading: the preset on Today and in the Focus window, and an app's role on Apps and sites (rule 7.15).
- **Anatomy:** `popover-width` panel, `surface-overlay`, 1px `line-strong` edge, `radius-md`, `shadow-overlay`, `z-popover`; heading (`body-sm` `ink`, weight 600), optional second line (`body-sm` `ink-muted`); 44px rows; separator; optional link row.
- **Props:** `heading`, `description?`, `items: { id, label, meta?, kind: 'radio' | 'checkbox' | 'link', checked?, disabled? }`, `readOnly?`, `onSelect`, `onClose`.
- **States:** checked radio: Choice radio shape (circle with a filled `focus` dot) on `selection`; checkbox: Choice checkbox shape plus an Off/On word; hover `surface-sunken`; disabled rows: dashed ring and `ink-muted` text; read-only (a session is running): heading "Classic · 25 / 5", line "Presets can change between sessions.", the current radio checked, others `aria-disabled`, the Settings row live. In the Focus window it opens only while idle and has no Settings row ("Preset for the next session", "Choosing one applies it and closes.").
- **Keyboard:** opens with click, Return or P (Today, if single-key shortcuts are on); ↑/↓ move, Return or Space chooses and closes, Esc closes; focus returns to the trigger.
- **VoiceOver:** `role="menu"` labelled by the heading and described by the second line; rows are `menuitemradio`, `menuitemcheckbox` or `menuitem`.
- **Do:** use it only for a choice. **Don't:** use it for navigation or commands (native NSMenu, rule 7.15) or stack two.

### 5.7 Select

- **Purpose:** a native `select` in the Input family, for values and the compact page pickers (Column, Day, Routine, Period) and the AppPicker's "Add as".
- **Anatomy:** visible label, `surface-sunken` field like Input, 1px `line-strong` border, `radius-md`, `body` weight 400 like Input, a drawn 14px chevron in `ink-muted` (4.82 light / 7.94 dark on `surface-sunken`), `hit-min` tall. Weight 600 only for the `labelHidden` compact page picker, whose value is the page title.
- **Props:** `label`, `labelHidden?` (only for a compact page picker that replaces a visible title), `options`, native props.
- **States:** hover `focus` border; focus ring; disabled dashed border with a reason line.
- **Keyboard and VoiceOver:** native. A Day picker lists "Today" as an extra first option only when the week shown does not contain today; otherwise the day itself reads "Mon 9 Nov, today" (finding d-planning-22).
- **Do:** keep the label visible. **Don't:** list two options for one value.

### 5.8 ScrollRegion

- **Purpose:** the only scrolling box on a list page (rule 7.1).
- **Anatomy:** the `minmax(0, 1fr)` track; an always-drawn scrollbar (`scrollbar-size` track, 6px `line-strong` thumb at least `hit-floor` tall, clear track, `scrollbar-gutter: stable`) so macOS overlay scrollbars never hide it; a 1px `line` hairline at the top once scrolled; while content remains below, a sticky `hit-floor` edge row on `surface` with a chevron and "More below" in `caption` `ink-muted` and a `line` top border.
- **Props:** `label` (required), `children`.
- **Keyboard:** `scroll-padding-block` (including the edge row's height) keeps focused items in view; the region is focusable only if it holds no focusable item.
- **VoiceOver:** `role="region"` with `label`; the edge row is `aria-hidden`.
- **Do:** put every control a regular page has inside it in compact. **Don't:** nest scroll regions or let the page itself scroll.

### 5.9 PageFrame

- **Purpose:** one frame for Board, Calendar, Routines, Review and Settings.
- **Anatomy (list variant):** three rows, `space-2` apart: header (`hit-min`; title or compact picker, and at its end the page's one primary, or the SessionSlot while a session runs, or a step word), status row (44px, reserved; Settings' save line), ScrollRegion. Padding `space-5 space-6 space-6` regular, `space-4` compact. At 360 × 240 the region is 240 − 44 − 44 − 32 − 16 = 104px (at least 96, section 3.2).
- **Heading:** the title is the `h1`; when a compact picker replaces it, the `h1` is visually hidden. Either way it receives focus on arrival.
- **Flow variant:** adds a fixed `control-lg` footer (rows still `space-2` apart): End (Esc) on the left, optional "Not now" ghost on optional steps, primary Continue on the right. The header's end shows "Step 2 of 4" / "All 4 steps done" in `body-sm` `ink-muted`. Below `layout-short-height` the status row takes no space while empty (conflict 21). Floor: a flow's region is at least 44px at the minimum window while a status line shows (240 − 44 − 44 − 52 − 32 − 24 = 44). If the layout test shows a step unusable there, the flow variant takes a minimum window height of 280 (the pick's fallback). Used by shutdown, weekly review and a running routine.
- **Props:** `title`, `primary?`, `status` (StatusRow content), `variant: 'list' | 'flow'`, `step?`, `footer?`, `compactPicker?`.
- **Keyboard:** tab order header → status action → region → footer.
- **Do:** one primary at the header's end. **Don't:** let the page scroll or give the header a second row.

### 5.10 SessionSlot

- **Purpose:** what replaces a planning page's primary while a session runs.
- **Anatomy:** compact MenuBarTimer (`timer-sm` digits and mode shape) and a 44 × 44 Pause IconButton (tooltip "Pause session" with ⌃⌥F) in a `surface-raised` pill with an inset 1px `line-strong` edge.
- **Props:** MenuBarTimer props, `onPause`, `onResume`.
- **VoiceOver:** the timer keeps its spoken name; the button's name changes with state.
- **Don't:** add End here; ending belongs to Today, the menu bar and ⌘.

### 5.11 SettingsIndex

- **Purpose:** the jump list beside Settings content from 640 × 480.
- **Anatomy:** `index-width` column of 52px items: section name (`body`) plus its current value (`body-sm` `ink-muted`).
- **States:** current: `selection` ground, `focus` side bar, `aria-current="location"`; a problem is said in words ("Not saved", "Check focus minutes"); the alert glyph appears only for a problem no save-line event announces (a shortcut conflict, "Pick a new shortcut").
- **Keyboard:** one roving tab stop, ↑/↓ move, Return jumps and focuses that section's heading.
- **Compact:** replaced by a "Jump to section" IconButton that opens a native menu.
- **Sections:** General, Timer, Notifications, Keyboard, Apps and sites, Privacy (with tracking), About and data.
- **Don't:** use colour or the glyph alone for a problem.

### 5.12 SettingsRow

- **Purpose:** one setting.
- **Anatomy:** label or legend; the control (Input, Choice, Select, ShortcutRecorder); an always-visible helper; one line for this row's status with an optional ghost or quiet action; `line` hairline between rows. Minute fields use `field-width` and `number-width`; Choice groups start-align.
- **States:** saved (rest); invalid (the Input's error state beside the field, section 8.3); not saved (the write-failure sentence and Try again); disabled (a visible line says why).
- **Do:** say a problem beside the field that caused it. **Don't:** move or hide the control while a save is pending.

### 5.13 ShortcutRecorder

- **Purpose:** records the global shortcut.
- **Anatomy:** a field-like `button` on `surface-sunken`, `line-strong` border, min width `field-width`; keys in mono (`aria-hidden`) plus a hidden span with the keys in words; visible hint "Change".
- **States:** rest; recording (`selection` ground, `focus` border, hint "Type the new keys, Esc cancels"); conflict (Input's thick border plus an alert-glyph line "Orasenda uses ⌘K for Commands. Pick a different one."); off.
- **Keyboard:** Return or Space starts recording; Esc cancels; ⌫ turns it off; "Use ⌃⌥F" restores the default. Needs ⌘, ⌃ or ⌥ plus a key.
- **VoiceOver:** no `aria-label`, no `aria-invalid`; name via `aria-labelledby` = row label + spoken keys + hint ("Start or pause focus from anywhere, Control Option F, Change"); the conflict, VoiceOver and off lines and the helper via `aria-describedby`. The All shortcuts table caps at `panel-width`.

### 5.14 AppRow

- **Purpose:** one app or site in Apps and sites and Privacy.
- **Anatomy:** the real app icon at `icon-lg` with `radius-sm` (a globe for a site); the name and an optional quiet second line ("Not installed now. The rule stays.", "Needs the browser extension", "Browser fallback until the extension is installed"); a read-only RoleTag; exactly one interactive element: an IconButton "Change role for <app>" that opens the role PopoverMenu (`aria-haspopup="menu"`; no letter key: it is one Tab from the focused row in the roving list, and Settings has no single-key shortcuts, conflict 24) or, on Privacy, "Record again". Height `control-lg` regular, `hit-min` compact. Below 360px of row width the RoleTag wraps under the name.
- **States:** built-in rows say "Built in" and have no interactive element; a failed save adds a line under the row (alert glyph and words, `role="status"`).
- **Keyboard:** each list is one tab stop; ↑/↓ move; the row is never a button.
- **VoiceOver:** list item read as "Stocks, Not recorded".
- **Don't:** make tags links or tab stops.

### 5.15 RoleTag

- **Purpose:** an app's role or privacy in words with a glyph.
- **Anatomy:** a `span`; a 14px line glyph at 1.5 stroke plus the word, `ink-muted` (Focus uses `focus`). Glyphs: Distracting = diamond outline, Always allowed = shield outline, Focus = filled circle, Neutral = outlined circle with a short horizontal bar across its centre (14px, 1.5 stroke; distinct from the alert glyph, whose bar is vertical with a dot below), Never record = closed eye, Site = globe.
- **Don't:** use amber or critical; drop the word; reuse a mode shape for anything but its mode (Focus reuses the filled circle on purpose because it means the Focus mode; that is the only reuse, and Neutral no longer uses the hollow circle, which means shallow, paused or idle).

### 5.16 AppPicker

- **Purpose:** add apps to a list without typing names from memory.
- **Anatomy:** a Dialog at `panel-width` × `picker-height` (a full-window sheet below 640 × 480): fixed header (title, Close IconButton, whose tooltip renders inside the dialog, 5.2); search Input (`type="search"`, visible label "Search apps" in the header above the field, as every Input, initial focus, ⌘F); scrolling sections (Open now; Used recently, only while recording is on; All applications); fixed footer: Select "Add as" with a visible label and the primary "Add N apps" (⌘↩). Privacy variant: "Add to never record", footer "Role stays the same.", primary "Never record N".
- **States:** already-listed apps are disabled with words ("Already Distracting"); keyboard focus rings the whole result row.
- **Keyboard:** ↑/↓ in results, Space toggles, ⌘↩ adds, Esc closes.
- **Don't:** show live foreground-app activity here beyond the "Open now" list.

### 5.17 BarRow

- **Purpose:** a duration as a bar, in Review and session summaries.
- **Anatomy:** a grid row of three content-sized columns (subgrid): label (glyph or shape + word), a `bar-height` pill filled with `line-strong` scaled to the largest value in the list, and the duration in `timer-sm` ("0h 35m"). Row height `control-sm`. Goal variant: the bar fills `focus`, has a `line` hairline track, and scales to the goal, not to the list; the goal tick is two 2 × 6px `ink` stubs above and below the track (never across the fill), with the words "Goal 12h". A value past the goal fills the whole track and the words carry it ("Goal 12h, reached"); the bar never extends beyond the track.
- **VoiceOver:** a list item, never focused: "Focus, 2 hours 10 minutes".
- **Don't:** show percentages, ratios or a coloured track.

---

## 6. Changed components

### 6.1 TimerRing
- `size="fluid"`: sized by its container between `timer-min-size` and `timer-full-size`; stroke stays size / 40, track a third of it.
- Warning: the word and triangle switch at once; arc and chip colour fade over `duration-slow`; instant under reduced motion. Replace "let the colour change over `duration-calm`" in Do.

### 6.2 StartButton
- Adds the play glyph (the only control that carries it, rule 7.12). The finish time moves out to the preset summary ("Classic · ends 15:20").
- **Why "Just 2 minutes" stays visible at every size:** starting is the hardest step for many people, and especially with ADHD. A two-minute session is small enough to say yes to without planning, and once started most people keep going. It is the quiet secondary beside Start, never a second primary. Write this as the README's purpose sentence for the quick start.
- `compactLabel`: "Start" below 400px of content; the accessible name stays "Start focus".
- `loading` ("Starting…") and `unavailable` both guard Start and Just 2 minutes; `unavailable` pairs with a status-row line (section 8).
- `aria-keyshortcuts="Space Meta+Enter"` on Start only.

### 6.3 FullScreenFocus
- Fluid ring. Leave full screen becomes a top-right IconButton (Esc); it still opens the Dialog "Leave full screen?" / "Your focus session will keep running." with "Stay in full screen" as initial focus.
- Same controls row as Today (Pause/Resume, End). An idle state with summary, the preset PopoverMenu (no Settings row) and Start. Caption "Space pauses · Esc leaves" while single-key shortcuts are on; "⌘. ends · Esc leaves" when they are off (rule 14). Stays open at the end with "Session ended." A borderless window per display, not macOS native full screen; drop "the host then leaves native full screen".

### 6.4 MenuBarTimer (README)
- New "Menu content" table for idle, running and paused: a disabled header line with the state word and minutes left rounded up (ceil): "Focus · 19 minutes left · ends 15:20" at 18:42, "Almost up · 2 minutes left · ends 15:20" at 01:48 (finding a-timer-13); ⌃⌥F as inert text; a per-display Full screen submenu; "Hide floating timer" as a toggle. VoiceOver label prefixed "Orasenda,".
- `compact: false` is now composed by FloatingTimer; point to it.

### 6.5 NavRail
- One tab stop with roving focus: ↑/↓ move, Return or Space activates, `aria-current` kept, ⌘1–6 from anywhere.
- Hidden in compact and strip layouts, replaced by a Pages IconButton (tooltip "Pages", ⌘1–6) that opens a native menu (pages, Commands…). Never icons-only.

### 6.6 InlineNotice: `variant="row"` (the status row, "StatusRow")
- Issue #120 asks to reuse InlineNotice, so the status row is its variant, not a new component.
- Anatomy: a fixed 44px row, no box; optional ModeChip (stacked strip only) and one ghost or quiet action as siblings; the message paragraph is the live region (`role="status"`, `aria-live="polite"`), always mounted and empty when there is nothing to say. The row is never the region, so chip changes are never announced.
- Text: `body-sm` `ink`, at most two lines; never grows and never truncates; tip copy at most 65 characters.
- Tones: `neutral` (no glyph), `attention` (alert glyph in `ink`), `warning` (amber triangle, time only).
- Action names contain their visible text and say what they retry ("Try again saving break minutes", "Try again saving").
- Focus: at a session end the line is announced first, then focus moves to Start focus, with the action one Shift-Tab away. Copy slots and priority: section 8.
- The existing default variant stays for in-place notices.

### 6.7 Input
- Optional unit suffix ("min") inside `number-width`.
- The label stays always visible and Input gets no `labelHidden`: the AppPicker shows "Search apps" visibly, so the README's rule and conflict 17's single exception (the Select compact page picker) both stand.
- Error: keeps the typed value, sets `aria-invalid`, thickens the border, and shows the alert glyph (not the triangle) with words that name the value still in use ("Between 5 and 180 minutes. Still using 45.").

### 6.8 Choice
- Groups start-align by default; centring is Today's `.os-intent` modifier only.
- `segmented` variant (SegmentedChoice): joined radios, `hit-min` tall, `line-strong` outer border and inner separators, the first and last carrying `radius-md` corners (no clipping); selected: `selection` ground, a 2px `focus` underline inside, bold text; keyboard focus rings the focused segment's label (`label:has(input:focus-visible)`) at the standard 2px offset; arrow keys move. Used to switch parallel lists in compact pages.
- `long` variant: full-width chip, top-aligned, bold title plus one `body-sm` `ink-muted` sentence (strength levels, recording checkboxes).

### 6.9 EmptyState
- `inline` variant inside a SettingsRow: no padding, one `body-sm` `ink-muted` line, no action ("Nothing is recorded yet. Choosing which apps count as focus or distraction comes in a later update.").

### 6.10 IntentPrompt
- Optional context line (focus shape + "Focus · ends 15:20") and strength line ("Gentle pause. Esc or Return goes back to focus.").
- Variants: Waiting ("You chose to wait until 15:12" / "Discord stays hidden until then.", keeps "I need <app> now"); Firm (Continue `aria-disabled`, described by a `role="status"` hint "Available at 15:21." that changes once to "You can continue now.", then a typed reason in TextArea); StrongLock (title "<app> is locked until 15:20", Back to focus only, description by helper approval state, independent of the selected strength (finding N1), strength line "It ends when the session ends; End on Today asks once."); Fallback ("Orasenda couldn't show the pause" / "Your session is still running. If an app was hidden, you can bring it back from the Dock.", Back to focus only, no app name, no scrim).
- Below `layout-tight-height` the step 2 and typed-reason steps drop the breathing circle and the gap goes from `space-5` to `space-4`. Back to focus stays the only primary and the initial focus.

### 6.11 Dialog
- New `safe` emphasis: the cancel action is the primary and the initial focus, and Esc or Return choose it; the confirm is quiet. Used only for "End the session and the lock?" during Strong lock ("Keep going" / "End session"). For Gentle and Firm, End never asks.

### 6.12 KanbanColumn
- `collapsed` + `onToggle`: a `column-strip-width` strip (`surface-sunken`, `radius-lg`) with chevron, name and count, `aria-expanded`. Hover: chevron and count turn `ink` and an inset 1px `line-strong` edge appears; pressed: `selection`.
- Expanded columns are fluid between `column-min-width` and `column-width` with `space-2` gaps. Opening a strip folds the least recently opened column, never the one holding the running task, and moves focus to the opened column's first card (or its heading when empty).

### 6.13 TaskCard
- `onSelect` beside `onOpen`: a click or an arrow key selects (`selection` + "Selected"); Return, a double-click or the context menu's Open opens. Hover is `surface-sunken` only.
- `density="row"` (TaskRow): 44px single line, type shape, title (ellipsis, full in the name), state word, estimate in `timer-sm`; a read-only form (no button) for the shutdown preview.

### 6.14 RoutineItem
- `readOnly` list form for overviews: hollow rounded square, label, detail; no checkbox, no tab stop. Checkboxes only in a running routine.

### 6.15 CommandPalette
- `Command.shortcut` (right-aligned Kbd); `hint` stays a second line. Compact variant below `layout-compact-height`: hidden title and label, Close IconButton beside the field. The first result is always the available start command; during a session Pause and End come first.

### 6.16 CapturePad
- Description "Leave it here and go back to what you were doing." Helper "Esc saves to Inbox and closes. ⌘↩ saves too." A line beside Save explains the chosen kind. Success closes the pad and announces "Saved to Inbox." once; no toast.

### 6.17 NowLine
- `compact` variant for week lanes: a 2px `focus` rule without the label. Today's week head carries the visible word "Today" on its own line (`body-sm` weight 600, `focus` on `selection`), so today is never marked by ground or weight alone.

---

## 7. README changes

### 7.1 Layout and hit targets (rewrite the numbers paragraph)
1. **Window classes.** Minimum 360 × 240, default 900 × 600. Compact below `layout-compact-width` or `layout-compact-height`. Today and the Focus window use the strip when the content box is wider than twice its height and under `layout-strip-height`, and under `layout-ring-min-height` use the strip from `layout-compact-width` wide and the stacked strip below it. Layout switches on resize only. The floater is its own composition (FloatingTimer), sized by the `floater-*` tokens; it never uses the strip and never changes layout by shape.
2. **Pages never scroll; regions do.** Timer surfaces never scroll at all: fixed tracks plus one flexible time track with a floor. List pages scroll only inside one ScrollRegion with a visible bar and "More below". Replaces "scroll below it". Verified by the Playwright WebKit layout test before any code change that depends on it. The approved a-timer Sizes board is the source of the size set; the test covers at least: windows 360×240, 360×360, 640×330 (strip from `layout-compact-width` under `layout-ring-min-height`), 640×480, 900×240, 900×600, 1440×900 and 3440×400; the Focus window at 1280×720 and 1920×1080; the floater at 280×56, 280×64 and 360×96 in every state (running, paused, warning, idle, ended, deep). Cases: the longest status line beside the widest action ("Open Settings"); the stacked strip running (chip plus a two-line store line); status row exactly 44px; `scrollHeight <= innerHeight` on Today, Focus and Floating.
3. **Compact never drops a control.** Compact pages append every regular control inside the region, in order.
4. **Board never scrolls sideways.** Columns fold into strips in one order everywhere: Doing, Today, Inbox, Backlog; Done starts folded; the compact column picker opens on Doing.
5. **Narrow fallbacks.** Below 400px of content the summary drops the preset name and Start reads "Start"; in both strips the idle summary drops the length the digits show. Accessible names never shorten.

### 7.2 Floater edge (Colour section)
6. The floater's boundary is shared by fill and edge: in every theme × wallpaper combination at least one holds 3:1 (section 9.3). Controls are measured against the floater's own fill. The repo's contrast check (to be added as `verification/contrast.py`, section 10) carries light (#EDEDED), mid-grey (#808080) and dark (#1C1C1E) wallpaper fixtures.

### 7.3 States
7. **Nothing disabled without a reason.** Every disabled control has a visible line that says why.
8. **Select is not open.** A click or an arrow key selects a card or row; Return, a double-click or Open opens it. Hover never uses the selection ground.
9. **One state word, one time left.** The chip is the only state word and the digits the only time left on a surface. Summaries lead with the preset: running "Classic · ends 15:20", paused "Classic · 25 min", strip idle "Classic · ends 15:20". The menu-bar menu has no chip, so its header line carries the word.

### 7.4 Motion and the two-minute cue (rewrite)
10. At two minutes the word and the shape switch at once; the ring, chip and strip colour fade into `amber` over `duration-slow`; one soft chime if sound is on; one warning-tone status-row line. Never red, no flash, no repeat. Under reduced motion everything is instant.

### 7.5 Iconography (rewrite)
11. **Mode shapes are reserved for modes.** Circle, half circle, rounded square, triangle, hollow circle and pause bars mean modes only. App roles use the role glyph family (Neutral is an outlined circle with a horizontal bar, never the hollow circle; the Focus role's filled circle is the one deliberate reuse, because it means the Focus mode); errors and "needs you" use the alert glyph; info uses the info glyph. All in `ink` or `ink-muted`, always with a word.
12. **The play glyph means a focus session starts.** Only Start focus (and the floater's Start pill) carries it. Start routine, Start shutdown and Start weekly review are words only.
13. **Icon set.** Add play, pause, stop-square, expand, collapse, window, menu, chevron, close, back, the final rail icons, the role glyphs and the alert and info glyphs. Placeholders on the canvases must not ship.

### 7.6 Keyboard and menus (new section)
14. **Single-key shortcuts.** Space, F and P follow a Single-key shortcuts setting (default on, WCAG 2.1.4) and exist only on Today, the Focus window and the floater; each also has a ⌘ combination or a focusable control. Space acts on the page only when focus is on the heading or body. After Start focus moves to Pause; after End, to Start. Pages with fields (Settings) have none, including focused-row letter keys. Copy never promises a single key a setting can turn off: tooltips, tips and captions show a single-key Kbd only while the setting is on and drop it when off (the Focus caption reads "⌘. ends · Esc leaves", the preset tooltip "Change preset"), and `aria-keyshortcuts` follows the same switch.
15. **One menu model.** Navigation, commands and context menus are native NSMenus (Pages, Focus view, the menu bar, the floater, card context menus). The only in-webview menu is PopoverMenu, for a choice that needs radios and a heading. Destructive items open the destructive Dialog.
16. **⌘↩ starts focus everywhere** with the selection or the page's target; ⌘K's first result is always the available start command.
17. **Lists are one tab stop.** The rail, board, day grid, routine list, tray, app lists and command list use roving focus.
18. **Esc closes the innermost thing first:** tooltip, then a recording shortcut field (cancels recording) or an edited field (restores the saved value), then menu, select or popover, then dialog (the capture pad saves first when it has text), then a step flow. One press does one thing. Esc never stops a session.
19. **⌘F** opens Filter on Board and search in the AppPicker; it means nothing else.
20. **Arrivals focus headings.** Arriving on a page focuses its `h1` (the visible title, or visually hidden when a compact picker replaces it); on a section, that section's heading; relaunching into a running session focuses the hidden "Today" `h1` so a stray Return presses nothing. ⌘[ goes back.
21. **Label in name (WCAG 2.5.3).** A control with visible text never gets an `aria-label` that drops it; compose names with `aria-labelledby`; key glyphs are spoken as words; `aria-invalid` only on roles that allow it.

### 7.7 Pages and flows (new section)
22. **One primary at the header's end** (or a flow's footer); while a session runs it becomes the SessionSlot.
23. **Overviews show; flows decide.** Overviews hold numbers and read-only lists; anything written or chosen lives in the flow its primary opens.
24. **A step applies on Continue.** End keeps earlier steps and discards the current one; nothing is deleted; optional steps have a visible "Not now".
25. **Saving model.** Settings save on change with no Save button and no primary; text and number fields save on blur or Return; Esc restores the saved value. The save line confirms only minute fields and the shortcut; choices confirm themselves. It returns to rest on the next change or page visit, never on a timer.
26. **Failed saves are never silent (#112).** Roll back, say why beside the setting and in the status row, offer Try again; the index says it in words (section 8).
27. **First run.** No screens or questions before the first session; Today opens at the default size with Start focus holding keyboard focus; the only first-run copy is "Welcome. Nothing to set up."; defaults Classic 25/5, match system theme, notifications off, tracking and blocking off, ⌃⌥F on; no permission at launch or at Start.
28. **One-time tips.** Only in Today's status row, only while idle, at most one per idle stretch, starting with "Tip:" and one "Got it" (VoiceOver "Got it, hide this tip"); seen after Got it, after using the feature or after the second showing, never on Start; two tips in total, no setting; never coach marks, overlays, pulses, dots or badges. A returning user is never welcomed back, counted or recapped.
29. **Permissions at the moment of need.** Asked only from the control that needs them; the ask says what happens without it; never during focus; a denial is a plain line with no shape and a quiet "Open System Settings", never amber or critical, re-read when the window regains focus, never re-asked and never turned on by the app. Offers can be set aside with "Not now", leaving a quiet way back.

### 7.8 Voice and privacy additions
30. **Review shows time, not scores.** Durations only; no percentages, ratios, "missed" or streaks; a reached goal is said plainly ("You reached your 12h goal.").
31. **Capture confirms by closing.** "Saved to Inbox." once; no toast, no badge.
32. **Usage is reflective, never live; private means nameless.** No live foreground-app display; running apps appear only in AppPicker; usage appears in Review and session summaries only while recording is on; a never-recorded app's name is never stored and its minutes count only toward one anonymous "Private apps" total and app switches; with recording off the usage line is absent, never zero.
33. **Strength copy is friction copy, and every rule is a visible row.** Use the four strength sentences (Gentle, Firm, Strong lock without and with the helper, keyed on helper approval alone); waits are clock times, never countdowns; End stays available during Strong lock and asks once. Nothing is paused without a row the user can see and change (the browser fallback is a normal Distracting row).
34. **Copy patterns.** Load errors: "Orasenda can't load <thing> right now." + Try again + "It's kept on this Mac." Store errors: "Orasenda can't save <thing> right now." + optional clause. Refusals say what didn't happen, why, and where to change it (section 8.2).

---

## 8. Status-row copy slots (InlineNotice `variant="row"`)

### 8.1 Priority
The row holds at most two sentences. Order:
1. The answer to the person's last action (a refused start, a failed save).
2. A one-shot milestone ("Session ended.", "Your last session ended while Orasenda was closed.", "Two minutes left. Finish the thought.").
3. The standing store line, joined after a short milestone in the same row ("Session ended. Orasenda can't save sessions right now."). If the two together exceed 65 characters, the higher one shows and the store line returns when it clears. A joined row takes the tone and glyph of its first sentence (so "Session ended. Orasenda can't save sessions right now." is neutral, with no glyph).
4. The welcome line (first run only).
5. A tip, only when the row is otherwise empty and Today is idle.

### 8.2 Today slots
| Event | Tone | Message | Action | Clears |
| --- | --- | --- | --- | --- |
| `timer_start` refused, Custom focus out of range (#120) | attention | "Focus didn't start. Custom focus needs 5 to 180 minutes." | ghost "Open Settings" (name "Open Settings to change custom minutes"): opens Settings › Timer and focuses the Focus minutes field | next Start, a preset change, or a valid save |
| `timer_start` refused, Custom break out of range | attention | "Focus didn't start. Custom break needs 1 to 60 minutes." | "Open Settings" (focuses Break minutes) | same |
| `timer_start` refused, both out of range | attention | "Focus didn't start. Custom minutes are out of range." | "Open Settings" (focuses the first invalid field) | same |
| Any other `timer_start` error, or the timer unavailable | attention | "Focus didn't start. Orasenda's timer isn't responding." | quiet "Try again" (name "Try again starting focus") | a successful start |
| Natural end, ⌘. or End | neutral | "Session ended." | none (tip's "Got it" when joined) | next transition |
| Recovered on launch | neutral | "Your last session ended while Orasenda was closed." | none | next transition |
| Two minutes left | warning | "Two minutes left. Finish the thought." | none | the end |
| Store unavailable | attention | "Orasenda can't save sessions right now." | none (spec A gives it no action; the scheduler already retries once a second) | while the state lasts |
| Store newer | attention | "This data was saved by a newer Orasenda." | none | while the state lasts |
| First run | neutral | "Welcome. Nothing to set up." | none | first Start |
| Tip | neutral | "Tip: ⌃⌥F starts or pauses focus from anywhere." (spoken "Control-Option-F …") | ghost "Got it" | Got it, use, or second showing |

The refused-start line appears in the status row on the same screen as Start, where the person is looking. Focus stays on Start; the line is announced through the live message; "Open Settings" is one Shift-Tab away. No red, no amber, no exclamation, no dialog. Every message fits two lines of `body-sm` at 360 wide beside the widest action, "Open Settings" (to be asserted by the layout test, which also covers the stacked strip running: chip plus a two-line store line).

### 8.3 Settings slots (save line and the field)
| Event | Beside the field | Save line (status row) |
| --- | --- | --- |
| At rest | helper only | "Changes save as you make them." (neutral, `ink-muted`) |
| Field saved | none | "Saved. Custom focus is now 50 minutes." |
| `settings_set` invalidSpec (#120) | Input error: alert glyph + "Between 5 and 180 minutes. Still using 45." (Break: "Between 1 and 60 minutes. Still using 10."); typed value kept, `aria-invalid`, described by the line | "Focus minutes weren't saved. Still using 45." + ghost "Show" (moves focus to the field) |
| Write failed | the reason: "Orasenda can't write its data file." | "Break minutes weren't saved. Back to 10." + "Try again" (name "Try again saving break minutes") |
| Store unavailable | none | "Orasenda can't save settings right now. Changes you make here may not be kept." + "Try again" (name "Try again saving") |
| Store unavailable (About row) | the About and data row reads "Orasenda can't read your sessions right now." | (the save line above) |
| Store newer | controls read-only, each with the reason | "This data was saved by a newer Orasenda. Settings are read-only until you update." |
| Shortcut conflict | recorder conflict line | none (the index shows "Pick a new shortcut" with the alert glyph) |

---

## 9. Contrast (computed, both themes)

### 9.1 Text pairs (need 4.5:1)
| Pair | Used for | Light | Dark |
| --- | --- | --- | --- |
| ink on surface | status-row message, BarRow label, goal stubs (mark) | 13.23 | 14.54 |
| ink-muted on surface | "More below", at-rest save line, idle length, hour labels | 5.36 | 7.52 |
| ink on surface-raised | Kbd text, floater digits | 14.57 | 13.05 |
| ink-muted on surface-raised | RoleTag, AppRow second line | 5.91 | 6.75 |
| ink on surface-overlay | Tooltip, PopoverMenu rows | 14.57 | 11.97 |
| ink-muted on surface-overlay | PopoverMenu second line, disabled rows | 5.91 | 6.19 |
| ink on surface-sunken | ShortcutRecorder keys, Select value, kanban strip on hover, TaskCard hover | 11.88 | 15.34 |
| ink-muted on surface-sunken | kanban strip count at rest, Select chevron (mark) | 4.82 | 7.94 |
| ink on selection | selected segment, checked popover row, pressed strip | 12.11 | 10.69 |
| ink-muted on selection | SettingsIndex value on the current item | 4.91 | 5.53 |
| focus on surface | ghost actions in the status row ("Got it", "Open Settings") | 5.31 | 8.74 |
| focus on selection | "Today" on the week head | 4.86 | 6.43 |
| focus on surface-raised | Focus RoleTag in a raised list | 5.85 | 7.85 |
| amber on amber-soft | (unchanged Warning chip) | 5.15 | 7.48 |

### 9.2 UI marks (need 3:1)
| Pair | Used for | Light | Dark |
| --- | --- | --- | --- |
| line-strong on surface | strip track, scrollbar thumb, BarRow fill, IconButton round edge, tooltip and popover edges against the page | 4.35 | 5.56 |
| line-strong on surface-raised | segment separators, Kbd edge, SessionSlot inset edge, BarRow in cards | 4.79 | 4.99 |
| line-strong on surface-overlay | Kbd edge inside a tooltip, dashed disabled radio rings, scrollbar in dialogs | 4.79 | 4.58 |
| line-strong on surface-sunken | kanban strip hover edge, recorder border, Select border | 3.90 | 5.87 |
| line-strong on selection | a separator beside the selected segment | 3.98 | 4.09 |
| focus on surface | strip fill (running), goal fill, compact NowLine | 5.31 | 8.74 |
| ink-muted on surface | strip fill (paused) | 5.36 | 7.52 |
| amber on surface | strip fill and end triangle, warning-tone triangle | 5.51 | 9.53 |
| focus on selection | selected-segment underline, SettingsIndex side bar, recorder border while recording | 4.86 | 6.43 |
| focus-ring on selection, surface-overlay, surface-sunken | focus rings on segments, popover rows, recorder | 4.86 / 5.85 / 4.77 | 6.43 / 7.20 / 9.23 |

### 9.3 Floater boundary against the desktop (fill / edge)
| Wallpaper | Light theme | Dark theme | Holds |
| --- | --- | --- | --- |
| light #EDEDED | 1.15 / **4.15** | **13.52** / 2.71 | yes, one of the two in each theme |
| mid-grey #808080 | **3.89** / 1.23 | **4.01** / 1.25 | yes, the fill |
| dark #1C1C1E | **16.75** / 3.50 | 1.08 / **5.37** | yes |

### 9.4 Documented non-pairs (never relied on)
| Pair | Light | Dark | Why it is acceptable |
| --- | --- | --- | --- |
| strip fill on strip track (focus, ink-muted, amber on line-strong) | 1.22 / 1.23 / 1.27 | 1.57 / 1.35 / 1.71 | The fill end is read by thickness (6px fill over a 2px track) and by the digits; both fill and track pass 3:1 against the surface. |
| line on surface | 1.46 | 1.45 | Decorative hairlines only (scroll-start line, row separators, goal-bar track). |
| surface-sunken / surface-raised / surface-overlay on surface | 1.11 / 1.10 / 1.10 | 1.06 / 1.11 / 1.21 | Hover grounds and panels; edges or words carry every state. |
| ink on focus (old goal tick) | 2.49 | 1.66 | No longer drawn; the stubs sit on `surface`. |

No new pair fails where it is relied on.

---

## 10. Outside the design system (same PR or a follow-up)

- **Spec A** (`docs/specs/2026-11-08-focus-session-loop.md`): line ~226 "Custom out of range" says where each refusal shows (Today: the status-row line and Open Settings; Settings: the field and the save line), per #120. Also the e-onboarding amendment (notification request moves to the Settings tick, `notify.session_end` defaults to false with the Q4 migration, the welcome line and tips join the allowed lines, the message is the live region) and b's store-state table citing #112.
- **Spec A contract changes this changeset makes** (each needs the spec text and its UI test updated in the same PR as the code):
  1. Spec line ~220 and the UI test (line ~263): the running finish line "Realistic finish · 15:20" beside the chip becomes the preset summary "Classic · ends 15:20" (rule 9; StartButton's idle `finishTime` moves there too, 6.2). Line ~227's "returns as 'Realistic finish · …'" changes with it.
  2. Spec line ~220: the Today preset "native radio group" (`.os-choice-group`) becomes the preset PopoverMenu behind the summary (5.6); Custom minutes are edited in Settings › Timer, which the menu's Settings row and the refused-start "Open Settings" open (8.2).
  3. Spec line ~220: the single `InlineNotice` slot becomes the reserved status row (6.6) with the section 8.1 priority and joined lines; the Today store line keeps no action, as spec A has it.
- **`verification/contrast.py`**: add it to the repo (from `design-pass/contrast.py`) with the three wallpaper fixtures and the section 9 pairs, and call it from `./scripts/ci.sh`. No such file exists in the repo today.
- **Playwright WebKit layout test** (rule 2) with the real fonts gates the first code change.
- **Planning copy table** (d) goes to the planning spec.
- **Weekly review step 3 task source** (finding d-planning-21) is a screen decision for the planning spec: Week lanes with the Unscheduled tray filtered to Deep tasks.
- **Compact Apps and sites helper rows** (finding c-tracking-18) are drawn on the tracking canvas; the AppRow and "compact never drops a control" rules above already require them.

## 11. Not covered by this changeset

Break states from sub-project B; the P6 profiles and "Strength for" select; the browser-extension flow; forced-colours and Increase Contrast variants of the new components; Lexend widths; localised copy lengths; final icon artwork; the task detail and block editors; drag-and-drop states. None of the five canvases draws these, so nothing is added for them.

---

## 12. Review response

Review of 2026-11-09 (verdict approve-with-changes, 4 major, 15 minor). Every finding is fixed in place in this file.

| Id | Severity | Change |
| --- | --- | --- |
| cs-1 | major | Single-key Kbds follow the setting. 5.2 Tooltip gains a "Single keys" line (the P Kbd and the `aria-keyshortcuts` key drop when the setting is off; tips and captions too); 5.2 Purpose says the P Kbd shows only while on; 6.3 caption is "Space pauses · Esc leaves" when on and "⌘. ends · Esc leaves" when off; rule 14 states the rule with both examples. |
| cs-2 | major | "and the floater" removed from `layout-strip-height` (3.1), TimerStrip purpose (5.4) and rule 1 (7.1). Each now says the floater is its own composition sized by `floater-*` and never changes layout by shape; 5.5 FloatingTimer says the same. |
| cs-3 | major | RoleTag Neutral is now an outlined circle with a short horizontal bar (14px, 1.5 stroke), told apart from the alert glyph (vertical bar and dot). 5.15 Don't names Focus as the only reuse; rule 11 says Neutral never uses the hollow circle. |
| cs-4 | major | AppRow's "key M" removed; the IconButton opens the role PopoverMenu with `aria-haspopup="menu"` and is one Tab from the focused row (5.14). Conflict 24 and rule 14 now say focused-row letter keys do not exist on Settings until rule 14 allows one. 5.1: "`aria-haspopup` when it opens a menu, native or PopoverMenu". |
| cs-5 | minor | 5.2 Anatomy: the tooltip renders inside the nearest open dialog when its trigger is in one; `z-popover` applies only outside the top layer. 5.16 AppPicker Close points to it. |
| cs-6 | minor | Section 10 lists the three spec A contract changes (finish line wording and its UI test, radio group to PopoverMenu, InlineNotice slot to the status row). Today's store line has no action (8.2), Settings keeps Try again. 8.3 adds "Store unavailable (About row)": "Orasenda can't read your sessions right now." |
| cs-7 | minor | Rule 6 no longer says the file "gains" fixtures; section 10: add `verification/contrast.py` from `design-pass/contrast.py` with the wallpaper fixtures and section 9 pairs, called from `./scripts/ci.sh`. |
| cs-8 | minor | 8.3 Write failed: status row "Break minutes weren't saved. Back to 10." + Try again; the reason sentence sits beside the field. 8.1 adds "a joined row takes the tone and glyph of its first sentence". |
| cs-9 | minor | 8.2 footnote now says "beside the widest action, 'Open Settings'"; rule 2 and the footnote add the stacked-strip running case (chip plus a two-line store line). |
| cs-10 | minor | 5.9: rows `space-2` apart; list region 104px at 360 × 240 (arithmetic shown); flow floor "at least 44px at the minimum while a status line shows", with the 280 minimum-height fallback if the layout test finds a step unusable. |
| cs-11 | minor | 5.7 Select: `surface-sunken`, weight 400 like Input; chevron `ink-muted` on `surface-sunken` is 4.82 / 7.94; weight 600 only for the `labelHidden` compact page picker. |
| cs-12 | minor | Took the second option: AppPicker shows "Search apps" visibly (5.16). 6.7 Input says the label stays always visible and Input gets no `labelHidden`, so conflict 17's single exception stands. |
| cs-13 | minor | 5.9 "Heading": the title is the `h1`; visually hidden only when a compact picker replaces it; either way it receives focus on arrival. Rule 20 reworded to match. |
| cs-14 | minor | Rule 18 order: tooltip, then a recording shortcut field (cancels) or an edited field (restores the saved value), then menu, select or popover, then dialog, then a step flow. |
| cs-15 | minor | Conflict 9 reason reworded ("`line-strong` is the neutral mark; `ink-muted` as a mark means paused or shallow, and bars are neither"). 3.2 adds an `ink-muted` row naming the paused arc and strip fill. |
| cs-16 | minor | Conflict 1 records the thumb minimum as `hit-floor`, not `hit-min`, with the reason. 3.2 `hit-floor` usage: thumb minimum (not a required target) and the "More below" row height (not a target). |
| cs-17 | minor | 5.17 goal variant scales to the goal; past it the bar fills the whole track and the words say "Goal 12h, reached". 3.2 adds a `body-sm` row: "`ink` or `ink-muted` on every surface and soft tint". |
| cs-18 | minor | The type group "Timer" is renamed "Mono" (family and style names unchanged), listed in 3.1 and 3.2; section 4 adds "and every key cap (`kbd`)" to the README Type paragraph. |
| cs-19 | minor | Rule 2 points to the approved a-timer Sizes board as the source and lists the sizes as "at least": adds 640×330, 3440×400, Focus at 1280×720 and 1920×1080, and the floater at 280×56, 280×64 and 360×96 in every state. |

Summary counts: changed tokens 20 → 22 (`body-sm`, `ink-muted`; the group rename is listed but not counted as a token). New tokens, components, rules and conflicts are unchanged in number.
