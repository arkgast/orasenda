# Orasenda design pass, phase 1: audit and brief

- Date: 2026-11-09
- Author: lead product designer (design-pass workflow, phase 1)
- Scope: every screen, before sub-project B
- Inputs read: `docs/SPEC.md` §1–3, `docs/ROADMAP.md`, `docs/DECISIONS.md` (ADR-004, 005, 011–013), `docs/specs/2026-11-08-focus-session-loop.md`, `design/system/README.md`, `tokens.json`, the component READMEs, `components/bundle.css` and `bundle.js`, `design/reviews/01–03`, `apps/orasenda/src/**`, `apps/orasenda/src-tauri/tauri.conf.json`, `src-tauri/src/{tray,session,scheduler,ipc,lifecycle}.rs`, `packages/tokens/tokens.css`.

Paths below are relative to the repo root. `app/` = `apps/orasenda/src/`, `tauri/` = `apps/orasenda/src-tauri/`, `ds/` = `design/system/`.

---

## 0. The owner's two questions, answered in one paragraph

**Philosophy:** today's Today is close to the spec but crowds the one screen that must stay empty. Configuration, notices and permission copy all sit in the same column as the timer, so the screen asks for decisions while you work. **Least friction:** starting takes two clicks (choose a preset, then press Start) and has no keystroke. Inside the app, the menu bar or the system, there is no shortcut at all. The idle menu-bar menu cannot start a session. The redesign makes Today a near-empty stage: the timer is centered and fills the window, there is one primary action and icon controls, and configuration lives in Settings and in a one-line preset summary. "Start focus" is one keystroke from anywhere: Space on Today, ⌘↩ in the app, ⌃⌥F system-wide and the first item of the menu-bar menu. The layout cannot push Start off-screen at any size, because the ring absorbs all spare space and every one-shot message goes in a reserved status row of fixed height, never above the controls as a new block.

*Revised 2026-11-09 after the senior design review (see §7, "Review response").*

---

## 1. Audit

Severity: **P0** breaks a principle or the owner direction, or hides the primary action. **P1** adds friction or is a clear gap. **P2** is polish or debt.

### 1.1 Known issue: Start falls below the bottom edge (P0)

**Symptom.** At the default and minimum window of 900×600 (`tauri/tauri.conf.json:14-19`), the idle Start pill is pushed below the bottom edge by two things: the "Session ended." notice (+80px: a 48px notice plus a 32px gap) and the Custom fields (+86px). macOS overlay scrollbars stay hidden until you scroll, so nothing tells you the page scrolls.

**Arithmetic from the CSS (idle, preset not Custom, no notice).** The stack down to the top of Start is:

- column padding, 32 (`app/styles/app.css:27`);
- header, 24 (`App.tsx:51-60`, `app.css:33-45`);
- gap, 32;
- h1 "Today", 28 (`Today.tsx:256`);
- gap, 32;
- ring row, 280 (`Today.tsx:264`, `app.css:96-101`);
- gap, 32;
- preset fieldset, about 70 (`Today.tsx:291-306`);
- gap, 32.

That totals about **562px** to the top of Start. Add the 52px Start pill (`ds/components/bundle.css:33`) and the 32px bottom column padding and the plain idle Today needs about **646px**. So at 900×600, with no notice and no Custom fields, the page **already overflows by about 46px**: the bottom of Start sits at about 614, below the 600px edge, and macOS shows no scrollbar. Every further element pushes it out further:

- the notice (`Today.tsx:287`);
- "Presets unavailable." (`Today.tsx:289`);
- the Custom fields (`Today.tsx:307-337`);
- the notification explanation under Start (`Today.tsx:369-371`);
- the dev-only spike panel (`Today.tsx:375`).

**Root cause (structural, not one element):**

1. **No viewport-bounded layout.**
   - `.app` is a flex row with no block size (`app.css:19-22`).
   - `.app-column` is a padded, gapped column (`app.css:24-31`).
   - So the document grows and scrolls as a whole. Nothing makes Start's row fixed.
2. **The primary action comes last in source and flow** (`Today.tsx:341-373`). Every conditional element is inserted above it (`Today.tsx:287, 289, 307`), so each one pushes Start down.
3. **The timer is a fixed size.**
   - `size={280}` is hard-coded (`Today.tsx:264`).
   - `.today-ring` has `min-block-size: var(--timer-size)` (`app.css:96-101`).
   - The ring is the only element that could give up space, and it cannot.
4. **Configuration lives on the action screen.** The presets and Custom fields (`Today.tsx:290-339`) are the biggest variable-height block, and they sit between the timer and Start.
5. **Chrome takes 116px for nothing actionable.** This is the brand and version header (`App.tsx:51-60`) plus a visible h1 "Today" (`Today.tsx:256-258`).
6. **The scroll is invisible.** WebKit on macOS uses overlay scrollbars, so overflow has no affordance.

**Fix principle (applies to every screen).** Each page is a viewport-bounded grid. Its control rows are `auto` and its content row is `minmax(0, 1fr)`. On Today the ring is fluid inside the `1fr` row, so it shrinks and the controls never move. One-shot messages go in a reserved status row of fixed height (44px, room for two lines of `body-sm` and one 44px ghost action), never in a new flow block. Add a WebKit layout test (Playwright WebKit at 900×600, at the new minimum, and with the longest message plus a store error) that asserts Start's bounding box is inside the viewport.

### 1.2 Today and the shell (`app/`)

| # | Sev | Finding | Principle / direction | Where |
|---|---|---|---|---|
| T1 | P0 | Presets and Custom minutes sit on Today, so the main screen is not "almost empty" and asks for decisions while you work | Owner 1; one primary action; fewer decisions | `app/pages/Today.tsx:19-24, 290-339` |
| T2 | P0 | The idle path to a start is two actions (choose a preset, press Start). There is no keyboard shortcut anywhere in the app: no Space, no ⌘↩, no ⌘K, no ⌘1–6 | Productivity: one action, one keystroke | `Today.tsx:341-349`; `App.tsx` (no key handlers) |
| T3 | P0 | Notifications are requested on the first Start whatever the setting, and the setting defaults to on | Owner 3; permissions at the moment of need | `tauri/src/session.rs:504-507`; `tauri/src/scheduler.rs:175-176, 205-222`; `tauri/src/ipc.rs:127-133` (`notify_session_end: true`) |
| T4 | P1 | The permission explanation is a standing line on Today ("Orasenda can tell you when a session ends…"). It is permission copy on the focus screen and adds height under Start | Calm by default; owner 3 | `Today.tsx:31, 369-371` |
| T5 | P1 | The timer is not centered: `.today` uses `align-items: flex-start` and the ring and status wrap side by side, left-aligned | Owner 1 (timer centered) | `app.css:76-93` |
| T6 | P1 | The state word is duplicated. `TimerRing` already renders a `ModeChip` in its centre (`ds/components/bundle.js:44`), and Today renders a second `ModeChip` beside it | Calm; one signal per state | `Today.tsx:275-276` |
| T7 | P1 | Pause, Resume and End are wide text buttons in a row. They take width, have no shortcut, and End sits right next to Pause | Owner 1 (icon controls); productivity | `Today.tsx:351-367` |
| T8 | P1 | The header shows the brand and a version and platform line on every screen. It is developer information that costs vertical space | Calm; empty edge | `App.tsx:51-60`; `app.css:33-57` |
| T9 | P1 | The rail is only as tall as the content (no block size), so its raised ground stops partway down a tall window | Polish / layout | `app.css:19-22`; `.os-nav` `bundle.css:194` |
| T10 | P1 | Settings is a placeholder even though theme, presets and notifications need a home now | Owner 4 | `App.tsx:62`; `pages/Placeholder.tsx` |
| T11 | P1 | No theme override exists. Tokens switch only on `prefers-color-scheme`, with no `[data-theme]` hook | Owner 4 (system/light/dark) | `packages/tokens/tokens.css:120` |
| T12 | P1 | A Custom range error shows only on the focus field ("Between 5 and 180 minutes."). Break has no helper (decided: "Between 1 and 60 minutes.") | Kind, plain copy | `Today.tsx:29, 316, 323-335` |
| T13 | P2 | The ring size is a hard-coded number (`280`) in app code, duplicating the `timer-size` token | Build from tokens | `Today.tsx:264` |
| T14 | P2 | The dev spike panel renders inside Today (dev builds with `ORASENDA_SPIKE=1`) and adds height there | Layout | `Today.tsx:15, 375` |
| T15 | P2 | "Timer unavailable." is muted text in the ring box, with no shape and no next step | Failures are never silent | `Today.tsx:272` |
| T16 | P2 | "Realistic finish · …" appears in two places with two owners: under Start when idle (`StartButton`) and beside the chip when running (`Today.tsx:277-281`). When idle it moves with the Start row | Consistency | `Today.tsx:277-281, 347` |

### 1.3 Menu bar, windows, permissions (`tauri/`)

| # | Sev | Finding | Where |
|---|---|---|---|
| M1 | P0 | The idle menu has only *Show Orasenda* and *Quit*, so you cannot start a session from the menu bar | `tauri/src/tray.rs:93-100` |
| M2 | P1 | The menu has no session header (mode, time left, finish), no *Settings…*, and no full-screen or floating entry | `tray.rs:43-48, 397-407` |
| M3 | P1 | One window only, with a 900×600 minimum. A small second-screen window and a floating timer are impossible at the config level | `tauri.conf.json:9-20` |
| M4 | P1 | There is no global shortcut plugin or registration, so "start from anywhere" has no keystroke | `tauri/Cargo.toml` (only `tray-icon`) |
| M5 | P2 | Ending a session leaves no cue in the menu bar (noted as a B question in spec A, "Behavior") | spec A §Behavior; `tray.rs:73-80` |

### 1.4 Design system (`ds/`)

| # | Sev | Finding | Where |
|---|---|---|---|
| D1 | P0 | There is no icon-button or tooltip pattern. Icon-only controls need a visible tooltip on hover **and** keyboard focus (native `title` does not show on focus), a VoiceOver label and 44×44 targets | README "Iconography"; `bundle.js` exports (no IconButton) |
| D2 | P0 | `TimerRing` takes only a numeric `size` (minimum 160, `bundle.js:37`). It cannot fill a container by height, so a responsive Today has to measure with JS or fall back to a fixed size | `bundle.js:36-48`; README "Layout" |
| D3 | P0 | `window-min-width` × `window-min-height` is 900×600 and the README says "scroll below it". That conflicts with the second-screen direction and is the policy that let Start scroll away | README:47; `tokens.json` size |
| D4 | P1 | `NavRail` README: "Don't collapse to icons only", but there is no rule for windows too small for the rail. Compact windows need a documented "rail hidden; menu button plus ⌘1–6" mode | `components/NavRail/README.md` |
| D5 | P1 | `FullScreenFocus` has a fixed 560px ring, `min-height: window-min-height` and `space-8` padding: 128 + 560 + 32 + 44 = 764px. That overflows a 1366×768 second screen once the menu bar is counted, and any short window. It also has no pause control: the README says "Don't add anything else" | `bundle.css:160`; `bundle.js:175-181`; README |
| D6 | P1 | `MenuBarTimer` `compact:false` (the floating timer) is display-only. A floating window needs pause or resume, "Open Orasenda" and close, plus a drag region | `bundle.js:50-58`; README |
| D7 | P1 | Missing components that Settings and tracking need: a switch (or a documented single checkbox `Choice`), a segmented choice for categories, a settings row (label, helper, control), a list row for apps (name, shape and word, actions), and a picker dialog with search | component list (23) |
| D8 | P1 | `StartButton` bundles "Start focus" with "Just 2 minutes" and the finish line in one block. A centered, icon-forward Today needs the finish line to move into the status line, and "Just 2 minutes" to be optional per layout | `bundle.js:257-259`; README |
| D9 | P2 | No `[data-theme]` override is generated for the tokens (see T11) | `packages/tokens/tokens.css:120` |
| D10 | P2 | The rail icons are still placeholders (final notes, open item 6). The new icons needed are play, pause, stop square, expand, picture-in-picture, gear, menu, close, the role glyphs (hollow circle, diamond, shield, closed eye, globe) | `03-final-notes.md` |
| D11 | OK | Contrast passes for 106 pairs per theme. The focus ring rule is global, reduce-motion removes all motion, and amber and critical usage is correct. Nothing in the app uses `critical` or red | `03-final-notes.md` "Verification"; `bundle.css:7, 211-214` |

### 1.5 Tracking and blocking today (spike only)

| # | Sev | Finding | Where |
|---|---|---|---|
| S1 | P1 | The app picker is a checkbox chip per **running process**, keyed by pid. It has no search, no installed apps, no categories, and apps with no bundle id are disabled with no reason given | `app/spike/DevPanel.tsx:106-121` |
| S2 | P1 | "Recent usage" is a raw list of `App · 09:41–09:52` segments with idle rows styled only by class. This is the live, nagging feed the spec rules out ("Usage data appears mainly in reviews") | `DevPanel.tsx:143-160`; SPEC §2.5 |
| S3 | P1 | There is no concept of "never record", safety allowlist or category in the UI. These are three separate concerns with no shared model yet | SPEC §2.6, §2.7 |
| S4 | P2 | Fallback overlay copy: "The overlay could not connect." is fine; keep "Back to focus" as the only primary | `app/spike/Overlay.tsx:50-55` |

---

## 2. Navigation model

### 2.1 Window sizes and layout classes

The page layout responds to **its own container** (container queries on `main`), not to the screen.

| Class | When (main window content box) | Chrome |
|---|---|---|
| **Compact** | width < 640 **or** height < 480 | No rail and no header. A 44×44 "Menu" icon button sits top-left and opens a small menu of the six pages plus *Commands…* (⌘K). Pages show their essential content only |
| **Regular** | 640–1279 wide and ≥ 480 tall | Rail (64px) plus page |
| **Spacious** | ≥ 1280 wide and ≥ 800 tall | Rail plus page. Today's ring grows to `timer-full-size` (560) |

- **New minimum window: 360×360** (tokens `window-min-width: 360px`, `window-min-height: 360px`).
- Why 360: compact Today needs these heights:
  - a 16px gutter;
  - the 44px top row (Menu, the preset summary, and the focus-view button);
  - the 44px status row (always reserved; it holds two lines of `body-sm` and a 44px ghost action such as "See summary");
  - the fluid ring;
  - a 16px gap;
  - the 52px controls row;
  - a 16px gutter.
- The fixed parts add up to **188px**, so at 360×360 the ring gets about **172px**, above the 160px TimerRing minimum. Width is driven by the idle row: "Start focus" (≈150) + 12 + "Just 2 minutes" (≈140) + 32 of gutters = 334px, so **both buttons stay visible at 360**. If a larger text size ever makes the row wrap, the compact pill reads "Start" with the play glyph (the accessible name stays "Start focus"); nothing moves into a menu.
- **Strip layout (by shape, not by height alone).** When the page's content box is wider than twice its height **and** shorter than 420px (for example 900×240 under a monitor, or an ultrawide corner), Today swaps the ring for large digits over a horizon bar (Direction C's composition, §5). 360×360 is square, so it keeps the ring. Full screen and the floating timer never use the strip layout.
- The 900×600 default size stays. Only the minimum changes.
- **"Scroll below it" is replaced by:**
  - **Today, Focus and Floating never scroll.** The ring absorbs the space.
  - **List pages (Board, Settings, Review) scroll inside their content region.** Their page title and primary action stay in a fixed header row, so the primary action is never scrolled away.
- The window frame is remembered per screen arrangement.

### 2.2 Where things live

- **Rail (unchanged order):** Today · Board · Calendar · Routines · Review · Settings. ⌘1–⌘6.
- **Settings** is the sixth rail item, plus ⌘, (macOS standard) and *Settings…* in the menu-bar menu.
- **Configuration moved off Today** can be reached three ways:
  1. **The preset summary line on Today** (one quiet text button, e.g. "Classic · 25 min · ends 15:20"). It opens a small anchored popover with the four preset radios and an "Edit times in Settings" link. Choosing a radio applies it and closes the popover. This is the "change it now" path; it never shows fields.
  2. **Settings › Timer**: presets, custom focus and break minutes with helpers, and (from B) breaks and long breaks.
  3. **⌘K**: "Use preset: Classic / 50/10 / Deep Block 90 / Custom".
- **The global "start focus" path** gives one action or one keystroke from anywhere:

  | From | Keystroke / action | Does |
  |---|---|---|
  | Anywhere in macOS | **⌃⌥F** (global, changeable in Settings › Keyboard, can be turned off) | Idle: starts the default preset. Running: pause/resume. It never opens a window |
  | The menu bar | First menu item, **Start focus · 25 min** | Starts |
  | Inside Orasenda | **⌘↩** | Starts the selected preset (idle) |
  | Today | **Space** while focus is on the page heading or the body (not on a control) | Start, or pause/resume |
  | Any page | **⌘K → Start focus** (first result) | Starts |
  | Today | Click **Start focus** | Starts |

  "Just 2 minutes" is **⌘⇧↩** in the app and an item in the menu-bar menu.
- **Why ⌃⌥F and not ⌃⌥Space.** ⌃⌥Space is macOS's own "Select the next input source" shortcut, on by default for anyone with two input sources. ⌃⌥F ("F" for focus) is free in macOS's default shortcuts. Capture is ⌃⌥N.
- **Registration failure.** If another app holds the combination, the hotkey is not registered, the menu-bar item drops its shortcut text, and Settings › Keyboard shows "Another app uses this shortcut. Pick a different one." Nothing else nags.
- **VoiceOver.** With Control-Option as the VoiceOver key, VoiceOver handles VO-F (its own Find) before any app sees it, so the global shortcut does not reach Orasenda while VoiceOver is on. Settings › Keyboard shows one plain line only while VoiceOver is running: "VoiceOver uses Control-Option keys. You may want a different shortcut." The menu-bar item and ⌘↩ always work. Phase 3 verifies this with VoiceOver on.
- **Single-key shortcuts** (Space, F, P on Today; T on Calendar; M in app lists) follow WCAG 2.1.4. Settings › Keyboard has a checkbox *Single-key shortcuts*, on by default, that every single-key binding honours. Turning it off leaves every ⌘ combination and the global shortcut working. The design-system README documents this under Accessibility.
- **The global shortcut is registered once, system-wide.** The menu-bar item never carries a live key equivalent for it (a live tray accelerator could fire alongside the global hotkey while Orasenda is active and start then pause). Where Tauri cannot show a non-live accelerator, the shortcut appears as inert text in the item title ("Start focus · 25 min    ⌃⌥F"). Phase 3 verifies that one press while Orasenda is frontmost starts exactly once.
- **Ending** is **⌘.** in the app (macOS "stop" idiom), *End session* in the menu, or the End icon. There is no confirmation dialog (see Q3).

### 2.3 The second-screen choice, offered each time

- The **Focus view** icon button (expand glyph) is the third running control on Today.
- **Tooltip:** "Focus view: full screen or floating (F)". **VoiceOver:** "Focus view".
- Activating it, or pressing **F** on Today, opens a menu anchored to the button:
  - **With one display:** two items.
    - **Full screen** (⌘⇧F).
    - **Floating timer, hide Orasenda** (⌘⇧T).
  - **With more than one display:** one full-screen item per display, then the floater.
    - **Full screen on <display name>** for each display, using `NSScreen.localizedName` (for example "Full screen on Built-in Retina Display", "Full screen on DELL U2720Q"). The main window's display comes first and carries ⌘⇧F.
    - **Floating timer, hide Orasenda** (⌘⇧T): shows the floating mini timer where it was last placed, then hides the main window.
  - So putting the timer on a second screen is one choice from this menu, with no dragging.
- Nothing is remembered as a default. The menu appears every time, so the choice stays explicit (owner 2). The two shortcuts skip the menu for people who already know which they want.
- The same items sit in the menu-bar menu (a *Full screen* submenu when there are several displays) and in ⌘K, so the choice is available without the main window.
- The Focus view button is also available **while idle**. Opening a focus view with no session shows the idle ring and a "Start focus" control (see §3.12).
- **Full screen is a separate Focus window, and it is not macOS native full screen.** It is a borderless window sized to the chosen display's frame, at normal window level, with `collectionBehavior` `fullScreenAuxiliary` and `moveToActiveSpace`. Why not native full screen: with "Displays have separate Spaces" off, native full screen blacks out every other display, so the main window would stop being usable on the other screen. The borderless window covers only its own display and leaves the main window, Board and Calendar usable elsewhere (ADR-013: one Rust state, many surfaces). The menu bar and Dock, where macOS shows them on that display, stay drawn above it; the ring is laid out inside the display's `visibleFrame`, so nothing hides beneath them.

---

## 3. Information architecture, screen by screen

Conventions used below:

- **Primary** is the single `primary` button, or "none" when the screen has no filled button.
- **Reuses** lists existing design-system components.
- **New** lists additions to the design system, made design-first (artifact, then `design/system/`, then code).
- Every icon-only control uses the new `IconButton`:
  - a 44×44 target;
  - a 20px line icon;
  - a tooltip that shows on hover **and** on keyboard focus after `duration-quick`, and names the shortcut; it stays while the pointer is over it, and Esc hides it without moving focus (WCAG 1.4.13);
  - `aria-label` set to the tooltip's first phrase;
  - `aria-keyshortcuts`.

### 3.1 Today

- **Purpose:** start focus with zero decisions, then show time and nothing else.
- **Primary:**
  - Idle: **Start focus**, a pill with a play glyph and the visible word.
  - Running or paused: none. Pause/Resume is the most prominent control, a quiet 52×52 circle.
- **Hierarchy (top to bottom, centered):**
  1. **Top row (44px).** Left: the Menu button (compact only). Centre: the preset summary text button, "Classic · 25 min · ends 15:20" when idle and "Focus · ends 15:20" when running. Right: the Focus view icon button. Only one top row exists, and there is no visible h1.
  2. **Status row (fixed 44px, always reserved).** A shape and a word for one-shot messages: "Session ended.", "Session ended while Orasenda was closed." (shortened from "Your last session ended while Orasenda was closed."), the store lines, and (B) "Two minutes left." with the triangle. It is `role="status"`.
     - It holds up to **two lines of `body-sm`** and, when a message has one, a single ghost action at the 44×44 hit minimum ("See summary", "Got it") on the same row. The fluid ring pays for the height.
     - It never grows. Text wraps to the second line at compact widths. **A store line is never truncated**; store copy is kept short enough to fit two lines at 360 wide (with the action) and that is checked by the layout test with the longest store line.
     - Only a milestone line may be ellipsized, and only as a last resort; its full text stays in the accessible name.
     - Priority order is store error, then the newest milestone.
  3. **Ring (fluid).** It fills the `1fr` row and is capped at `timer-full-size`. Its centre holds the ModeChip (the only state word), the digits, and the task and intent from P2/B.
  4. **Controls row (52px, fixed).**
     - Idle: [Start focus] [Just 2 minutes].
     - Running: [Pause] ··· [End], with Pause centered and End set apart by `space-6`, a square glyph, and a ghost style.
     - Paused: [Resume] ··· [End].
- **States:**

  | State | Ring | Chip / word | Controls |
  |---|---|---|---|
  | idle | hollow, no digits | "No session" | Start focus, Just 2 minutes |
  | running | draining arc, `focus` | "Focus" | Pause, End |
  | paused | frozen arc, `ink-muted` | "Paused" (bars) | Resume, End |
  | warning (B) | slow fade to `amber` (decided), instant under reduce-motion | "Almost up" (triangle) | Pause, End |
  | break (B) | `break` arc | "Break" (half circle) | Skip break, End |
  | ended | idle ring | status row: "Session ended." | Start focus |
  | timer unavailable | ring box shows the hollow shape and "Timer unavailable. Restart Orasenda to try again." | — | none |
  | presets unavailable | summary reads "Default preset" | — | Start still works (Rust default) |

- **Keyboard:**
  - Space: start, or pause/resume.
  - ⌘↩: start. ⌘⇧↩: just 2 minutes. ⌘.: end.
  - F: focus view menu. P: preset popover.
  - Space, F and P are single-key shortcuts and stop working when *Single-key shortcuts* is off in Settings › Keyboard (§2.2).
  - Tab order: summary → Focus view → status action (when present) → controls.
  - After a page change, focus goes to a visually hidden h1 "Today" (kept for VoiceOver navigation; it is `os-sr-only`).
- **VoiceOver labels:**
  - Pause: "Pause session".
  - Resume: "Resume session".
  - End: "End session".
  - Focus view: "Focus view, full screen or floating".
  - Menu: "Pages".
  - Ring: the existing spoken name.
- **Sizes:**
  - 360×360: compact. Ring about 172. Start focus and Just 2 minutes both visible (Q5).
  - 900×600: regular. Ring about 340 (600 − 32 top − 44 top row − 44 status − 52 controls − 32 bottom = 396, less about 56 of gaps between rows).
  - 900×240 and other strips (width > 2× height and height < 420): the strip layout, digits over a horizon bar (§2.1, §5 Direction C).
  - Full screen: spacious. Ring 560.
  - The controls never move.
- **Reuses:** TimerRing, ModeChip, StartButton (Start face), Button.
- **New:** IconButton plus Tooltip, a fluid TimerRing size, a status-row variant of InlineNotice (two lines, no box, one optional ghost action), and a popover menu.

### 3.2 Board (P2)

- **Purpose:** choose what to work on and keep WIP honest.
- **Primary:** none on the board. Each card has "Start focus on this" (an icon in the card's action area) and the global Start uses the active card.
- **Hierarchy:**
  - Header row: the title "Board", the "Add task" quiet button (⌘N) and a filter.
  - Columns: Inbox → Backlog → Today → Doing → Done, each a `KanbanColumn` (280).
  - The columns region scrolls horizontally inside the page and the header stays fixed.
- **States:**
  - Empty column: "Nothing here yet. That's fine."
  - At limit: amber triangle and "At limit".
  - Error: one line in the column.
- **Keyboard:**
  - Arrows move between cards; Enter opens a card.
  - ⌘←/→ moves a card between columns; ⌘↩ starts focus on it.
  - ⌘N adds a task.
- **Compact:** a single column at a time with a column picker (segmented choice).
- **Reuses:** KanbanColumn, TaskCard, Dialog, Input, TextArea.
- **New:** segmented choice and a card action IconButton.

### 3.3 Calendar (P3)

- **Purpose:** see and shape today's blocks.
- **Primary:** none. A block that is starting offers "Start focus" through an InlineNotice action.
- **Hierarchy:**
  - Header: the date, Day/Week as a segmented choice, and Today.
  - A scrolling time grid (2px per minute) with a NowLine.
  - An unscheduled tray on the side (regular) or below it (compact).
- **States:**
  - Empty day: "Nothing planned. That's fine."
  - Import permission (EventKit) is asked only from "Show my calendars", with an explainer.
- **Keyboard:**
  - Arrows between blocks; Enter edits.
  - ⌥↑/↓ moves 15 minutes; ⌥⇧↑/↓ resizes.
  - T jumps to now (single-key; also ⌘T, which always works).
- **Compact:** day only, with the tray behind a button.
- **Reuses:** TimeBlock, NowLine, InlineNotice, Dialog.

### 3.4 Routines (P4)

- **Purpose:** run today's routine and see consistency kindly.
- **Primary:** **Start routine** (the next routine).
- **Hierarchy:**
  - The next routine with RoutineItems.
  - HabitDots per habit.
  - A WellnessNote at the end.
- **States:**
  - Empty: the template picker.
  - Missed a day: a hollow dot and "Two days off. Today is a fresh start."
- **Keyboard:** Space toggles an item; ↑/↓ moves between items.
- **Reuses:** RoutineItem, HabitDots, WellnessNote, EmptyState.

### 3.5 Review (P4, with usage from P5)

- **Purpose:** the daily shutdown and the weekly review, and the only place usage appears.
- **Primary:** **Start shutdown** (daily) or **Start weekly review**.
- **Hierarchy:**
  - The deep hours against your goal, as a neutral trend.
  - Time per project.
  - Usage (§3.8).
  - Top reasons given for bypassing, as a neutral list.
  - One improvement.
  - Plan next week's deep blocks.
- **States:**
  - Empty: "Nothing to review yet. That's fine."
  - Tracking off: one line, "Usage is off. Turn it on in Settings › Apps and sites", as a link.
- **Compact:** one section at a time.
- **Reuses:** EmptyState, InlineNotice, Button.
- **New:** neutral bar row (via the dataviz rules).

### 3.6 Settings (now, ahead of E)

- **Purpose:** every preference in one place, saved on change.
- **Primary:** none (changes save at once; failures roll back with one line, following the conventions doc).
- **Layout:**
  - Regular: a section list (left, 200px) and the section content (max `content-width`), using a two-pane grid inside the page.
  - Compact: the section list first, then drill-in with a "Back to Settings" ghost button. ⌘[ goes back.
- **Sections and contents (now):**
  1. **General**
     - Theme: radios *Match system* (default), *Light*, *Dark*. This sets `data-theme` on `<html>` and the native window appearance.
     - *Reading comfort font (Lexend)*: a checkbox.
     - *Show "Just 2 minutes"*: a checkbox, default on.
  2. **Timer**
     - Default preset: radios Classic 25/5, 50/10, Deep Block 90, Custom.
     - *Custom* focus minutes, helper "Between 5 and 180 minutes."
     - *Custom* break minutes, helper "Between 1 and 60 minutes."
     - Both helpers are always visible, and the fields stay on screen whichever preset is chosen.
     - B adds: long break, rounds, flow extension cap.
  3. **Notifications**
     - Checkbox *Tell me when a session ends*, **off by default**.
     - Turning it on sends the system request, at that moment and only then.
     - States:
       - granted: checked;
       - denied: unchecked, with the line "macOS has notifications off for Orasenda." and a quiet button "Open System Settings";
       - unavailable: "Notifications aren't available in this build."
     - B adds *Two minutes before the end* as a sub-option.
  4. **Keyboard**
     - Global shortcuts: *Start or pause focus* ⌃⌥F, with a recorder field and an "Off" choice. *Capture a thought* ⌃⌥N (D).
     - Row error line: "Another app uses this shortcut. Pick a different one." when registration fails. While VoiceOver runs: "VoiceOver uses Control-Option keys. You may want a different shortcut." (§2.2).
     - *Single-key shortcuts*: a checkbox, on by default, helper "Space, F and other one-key shortcuts. Shortcuts with ⌘ always work." Every single-key binding honours it (WCAG 2.1.4).
     - A read-only list of in-app shortcuts.
  5. **Apps and sites** (P5/P6; see §3.7). Before then, this section is an EmptyState that explains what will come and that nothing is recorded.
  6. **Data** (E): export, import, backups, and "Delete all data" (the one `critical` button, in `Dialog destructive`).
  7. **About**: the version and platform line (moved from the header), licence and privacy.
- **States:** every row has an error line slot. A section that failed to load shows "These settings couldn't load. Try again." with a quiet Retry.
- **Keyboard:**
  - ↑/↓ in the section list, Enter opens a section.
  - Tab through rows; native radios and checkboxes.
  - ⌘, opens Settings from anywhere.
- **Reuses:** Choice (radios and checkboxes), Input, Button, InlineNotice, Dialog, EmptyState.
- **New:** a SettingsRow pattern (label, helper and control on one grid), a shortcut recorder field, and a section list (a NavRail-like vertical list with `aria-current`).

### 3.7 Tracking and blocking setup (Settings › Apps and sites; P5/P6)

**Rethink.** One mental model replaces four lists: every app (or site, from P7) has **one role**, and separately it may be **private**. Role decides blocking; privacy decides recording. They are independent, so an app may appear in both sections below.

- **Roles, each with its own line-icon glyph and always a word:**
  - **Focus**: filled circle. This deliberately matches the Focus mode shape, because it means the same thing (time spent on focus work).
  - **Neutral**: hollow circle. The default; not listed under Roles.
  - **Distracting**: diamond outline, in `ink-muted`. Never amber (amber means "almost up") and never critical.
  - **Always allowed**: shield outline (the safety allowlist).
  - **Never record** (privacy, not a role): closed eye.
- **Rule for the design-system README:** mode shapes (filled circle, bars, triangle, half circle, rounded square) are reserved for modes. Other concepts get their own glyphs, and Focus is the one stated overlap. Without this, "never by colour alone" breaks, because a shape would mean two things.
- **How the attributes relate:**
  - Role decides blocking: Distracting apps meet the blocking profile during focus, and Always allowed apps are never blocked.
  - Never record decides tracking: no name or duration is stored, and usage shows "A private app".
  - They are independent: a never-recorded app can still be Distracting. The blocking rule stores the bundle id, never usage.

**Screen (regular):**

- **Header:**
  - Title "Apps and sites".
  - Tracking checkbox: *Record which app is in front, and for how long*, off by default.
  - **Primary:** **Add apps**.
- **Section 1, Roles.** Three grouped lists, in this order:
  1. Distracting.
  2. Focus.
  3. Always allowed (pre-filled with Phone, Messages, FaceTime, System Settings and the accessibility tools, with the line "These stay reachable during every block.").
  - **Each row (AppRow):** the app name, the role glyph and word, a *Never record* checkbox, and a "Move to…" menu button (IconButton, label "Change role for <app>").
  - Empty groups show one kind line ("No distracting apps chosen. That's fine.").
- **Section 2, Privacy.**
  - *Pause recording*: a checkbox with the helper "Nothing is recorded while this is on." (Disabled, with the word "Recording is off", when the tracking checkbox is off.)
  - **Never record**: the list of private apps, **including Neutral apps** that have no role. Each row shows the closed-eye glyph and "Never record", the role glyph and word when it has one, and a "Record again" quiet button. "Add an app to never record" opens the same picker with the role choice replaced by "Never record".
  - A Distracting app that is also private appears in both sections: once under Roles (with its *Never record* box checked) and once under Privacy. That is intended: each section answers one question.
- **AppRow also covers domains** (P7, browser sites): the same row with the domain in place of the app name and a globe glyph as the identity mark.
- **Add apps dialog** (`panel-width` 420; searchable list):
  - Sections: *Open now* (running apps, no permission needed), *Used recently* (only if tracking is on), *All applications* (scan of /Applications).
  - Each result has a checkbox. A role radio group at the bottom ("Add as: Distracting / Focus / Always allowed") applies to the checked rows.
  - **Primary:** "Add N apps".
  - Apps with no bundle id are listed and disabled with the words "Can't be blocked".
- **Profiles (P6):** a segmented choice above the Roles section (Deep Work, Study, Light, Custom). Strictness is radios Gentle (default), Firm, Strong lock, each with one honest sentence. Strong lock: "Strong friction, not a hard lock. Quitting Orasenda ends it."

**Other states:**

- Before tracking is on, nothing is listed under Used recently, with the line "Turn on recording to see apps you used."
- Permission: none needed (ADR-004, ADR-005).
- Browser extension missing (P7): a line about the browser fallback.

**Keyboard and compact:**

- Keyboard: ⌘N opens Add apps. In a list, ↑/↓ moves between rows; M opens the move menu (single-key, so it follows the *Single-key shortcuts* setting; the menu button is always reachable by Tab and Enter); Space on the focused checkbox toggles *Never record* (native control behaviour, not a page shortcut).
- Compact: the sections become a segmented choice showing one at a time (Distracting, Focus, Always allowed, Private).

**Components:**

- Reuses: Choice, Dialog, Input (search), Button, EmptyState.
- New: AppRow (apps and domains), AppPicker dialog, segmented choice, menu button, and the role glyph family (hollow circle, diamond outline, shield outline, closed eye, globe). Design-system decision: Distracting is not a mode hue. It uses `ink-muted` and its own shape, never amber or critical.

### 3.8 Usage and recent apps (in Review; per-session summary)

- **Principle:** usage is reflective, never live.
  - There is **no live foreground-app display** anywhere during focus.
  - The only place that shows apps open now is the *Add apps* picker, where they are needed to choose.
- **Review › Usage:**
  - A neutral split by role (Focus, Neutral, Distracting) for the day or week, drawn as horizontal bars. Each bar carries a word and a duration (`2h 10m`), using one hue plus shapes and never red.
  - Below it, the apps by time, each with its role shape and word.
  - Private apps are pooled as "Private apps · 0h 20m".
  - Idle time is not shown as a bar; it is excluded, with a footnote.
- **Per session:** after a session ends, the session record (in Review › Sessions and behind the "Session ended." status-row action "See summary") shows "Focus 25 min · ended 15:20". **Only when recording is on** does it add one usage line, for example "14 app switches · mostly Xcode". Private apps are never named there: they count toward switches and pool as "a private app" ("mostly a private app" when that is the case). With recording off, the line is absent, never "0 app switches". It is never a toast and never shown during the session.
- **Actions:** "Delete this day", "Export", and a link to Settings › Apps and sites.
- **Reuses:** EmptyState, Button, Dialog (destructive delete).
- **New:** the neutral bar row.

### 3.9 Blocking overlay (P6)

- **Purpose:** an honest pause when a Distracting app comes to the front during focus.
- **Primary:** **Back to focus** at every step (IntentPrompt rule).
- **States:**
  - **Gentle:** step 1 (breath, the three actions) and step 2 (reason, Continue).
  - **Firm:** a 60-second wait. The words read "You can continue at 15:21". No live countdown: a ticking countdown pressures, and a wall-clock time is calmer. Then the reason is typed.
  - **Strong lock:** no Continue. The line reads "Locked until 15:20. Strong friction, not a hard lock."
  - **Overlay failed to connect:** the existing fallback.
- **Keyboard:**
  - Escape = Back to focus.
  - Arrows pick a reason.
  - Initial focus is on Back to focus.
- **VoiceOver:** the dialog title "Is this what you intended?".
- **Sizes:** centred `panel-width` on the blocked app's screen. The breath circle is static under reduce-motion.
- **Reuses:** IntentPrompt, Dialog.

### 3.10 Menu-bar menu (native)

- **Title:** the glyph and the digits (unchanged; B adds the triangle at two minutes).
- **Menu when idle:**
  1. **Start focus · 25 min**, with "⌃⌥F" as inert shortcut text (never a live accelerator, see §2.2)
  2. Just 2 minutes
  3. — Preset ▸ (Classic 25/5 ✓, 50/10, Deep Block 90, Custom <saved focus>/<saved break>, for example "Custom 45/10" with spec A's defaults). The Custom label always shows the saved values, never a literal.
  4. —
  5. Full screen (one display) or Full screen ▸ (several displays: one item per display by `NSScreen.localizedName`, the main window's display first)
  6. Floating timer
  7. —
  8. Capture a thought… (D)
  9. Show Orasenda
  10. Settings…
  11. —
  12. Quit Orasenda
- **Menu while running or paused:**
  1. A disabled header line: "Focus · 18 minutes left · ends 15:20" (paused: "Paused · 18 minutes left")
  2. Pause / Resume
  3. End session
  4. —
  5. Full screen, or Full screen ▸ per display (as above)
  6. Floating timer (reads "Hide floating timer" while it is shown; this is the toggle)
  7. —
  8. Capture a thought…
  9. Show Orasenda
  10. Settings…
  11. —
  12. Quit Orasenda
- When the global shortcut is off or failed to register, item 1 carries no shortcut text.
- **VoiceOver:** the existing item label. Menu items are plain words with no emoji.
- **New:** a design-system README addition (the menu content table under `MenuBarTimer`).

### 3.11 Floating mini timer (C, pulled forward with the redesign)

- **Purpose:** time always visible on any screen while Orasenda is hidden.
- **Window:**
  - A non-activating, always-on-top panel, on all Spaces.
  - **Default size 280×64; resizable from 248×56 up to 360×96.** Geometry at the minimum: 12 gutter + 16 shape + 8 + digits `timer-md` (about 76 for "88:88") + 8 + two 44px IconButtons with 4 between (92) + 12 gutter ≈ 224, leaving slack for wider digits ("1:28:00" in Deep Block 90).
  - The whole surface except the buttons is a drag region.
  - The frame is remembered per display.
  - `surface-raised`, `radius-lg` and `shadow-raised`. **In dark, shadows barely show, so the floater also carries a 1px `line-strong` border** (light keeps `line`), so its edge meets 3:1 against any desktop.
- **Hierarchy:**
  - Left: the mode shape.
  - Centre: the digits (`timer-md`), with the task on a second line when tall enough (MenuBarTimer `compact:false`).
  - Right: **two IconButtons, always visible**, never hover-only:
    - Pause/Resume, "Pause session (Space)";
    - Open Orasenda, "Open Orasenda (↩)", which shows the main window and closes the floater.
  - **Close has no button.** It is Esc (when the floater has key focus), "Close floating timer" in the floater's context menu (right-click or ⌃-click), and the menu-bar item "Hide floating timer". The menu bar keeps the time.
- **States:**
  - Running.
  - Paused: bars and frozen digits.
  - Warning (B): triangle and the "Almost up" word on the second line, or for screen readers only when the floater is one line tall.
  - Idle after end: hollow circle, "Session ended.", and Start focus takes Pause's slot (play, "Start focus").
- **Keyboard path:**
  - The panel is non-activating: it never takes focus on its own, so it never steals typing from the app you are in.
  - **⌘K "Floating timer" and the menu-bar item open it and give it key focus.** ⌃⌥F still pauses from anywhere without focusing it.
  - A click on it gives it key focus without activating Orasenda (the panel becomes key; the main window stays hidden).
  - With key focus: Space pauses or resumes, ↩ opens Orasenda, Esc closes. Tab moves between the two buttons, and focus rings show as usual. Focus returns to the previous app when the floater closes or loses key status.
- **VoiceOver:** the group is labelled "Floating timer", the timer label comes from MenuBarTimer, and every button has a label. The context menu is reachable with VO-Shift-M.
- **Reuses:** MenuBarTimer (`compact:false`).
- **New:** a FloatingTimer composition (the timer, two IconButtons, the context menu and the drag region).

### 3.12 Full-screen focus (C)

- **Purpose:** the deepest, emptiest view, on any display.
- **Window:** the dedicated Focus window, **borderless and sized to the chosen display's frame, at normal level**, with `collectionBehavior` `fullScreenAuxiliary` + `moveToActiveSpace`. It is not macOS native full screen (§2.3), so other displays stay usable whatever the "Displays have separate Spaces" setting. The menu offers one item per display ("Full screen on <display name>"), so no dragging is needed. Nothing is remembered.
- **Primary:**
  - Running: none.
  - Idle (opened from Focus view before a session): **Start focus**.
- **Hierarchy (centred):**
  - The fluid ring, up to 560 and sized to the display's `visibleFrame` short side minus `space-8` margins.
  - The task and the clock inside the ring.
  - One quiet row below: Pause/Resume (IconButton) and "Leave full screen" (ghost text).
  - A caption: "Space pauses · Esc leaves".
- **States:** running, paused, warning (B), break (B). At the end the window stays and shows the idle ring with "Session ended." and Start focus (Space). It does not jump back to the main window.
- **Keyboard:**
  - Space: pause/resume. ⌘.: end.
  - Esc: the confirm Dialog "Leave full screen?" with "Your focus session will keep running." (existing).
  - ⌘Tab works; other apps' windows can come in front of it on that display, which is honest (it is a window, not a lock).
- **Sizes:** the ring is fluid, so a 1366×768 or 1280×720 second screen fits with no clipping, fixing D5.
- **Reuses:** FullScreenFocus, TimerRing, Dialog.
- **Change:** the FullScreenFocus README (add the pause control and the caption, make the ring fluid, and record the borderless-window rule).

### 3.13 Capture pad (D)

- **Purpose:** offload a thought in under three seconds without leaving focus.
- **Primary:** **Save to Inbox**.
- **Trigger:**
  - Global ⌃⌥N, configurable in Settings › Keyboard.
  - The menu-bar item.
  - ⌘K "Capture a thought".
  - It opens its own small panel on the active display, above the current app. The main window stays hidden.
- **States:** empty (Save disabled), saving, save failed ("Your note is still here. Try saving again.").
- **Keyboard:**
  - ⌘↩ saves.
  - Esc saves when there is text, and closes when empty.
  - ←/→ switches Internal/External.
- **Reuses:** CapturePad.

### 3.14 ⌘K palette

- **Purpose:** every action by name, from any page.
- **Primary:** n/a (a list).
- **Commands, context-filtered** (only available ones are listed, per the README):
  - Start focus · Classic 25 min
  - Just 2 minutes
  - Pause / Resume / End session
  - Full screen (one display), or Full screen on <display name> (one command per display)
  - Floating timer (opens it with key focus, §3.11)
  - Use preset: … (×4)
  - Go to Today, Board, Calendar, Routines, Review, Settings
  - Theme: Match system, Light, Dark
  - Turn notifications on/off
  - Capture a thought
  - Add apps (P5)
- The hint column shows the shortcut.
- **Compact:** it is the main navigation aid alongside the Menu button.
- **Reuses:** CommandPalette.

### 3.15 Onboarding (P3; minimal now)

- **Now (P1):** no onboarding. Today *is* the first run: Start is visible and focused.
  - After the first session ends, the status row shows one line once: "Tip: ⌃⌥F starts or pauses focus from anywhere." with a "Got it" action. It is never shown again. If the shortcut is off or failed to register, the tip is not shown.
- **P3 (three short steps, each skippable with "Not now"):**
  1. Wake time and morning/evening.
  2. Default preset (the same radios as Settings › Timer).
  3. Morning template.
- Each step has one primary, "Continue". The last step's primary is "Start focus".
- No permissions are asked. Tracking, blocking and notifications are offered in context later.
- **Reuses:** Choice, Button, Input.
- **New:** a step indicator ("Step 2 of 3" as a word, no dots-only).

---

## 4. Design-system changes this pass needs (design-first)

These are listed for phase 2. Each one is: artifact first, then `design/system/`, then code.

1. **IconButton + Tooltip** (new). 44×44, a 20px line icon, an always-required `label` and an optional `shortcut`. The tooltip shows on hover and on `:focus-visible`, sits above or below, uses `surface-overlay` and `body-sm`, and appears after `duration-quick` (instantly under reduce-motion). It never carries information the label lacks. **Dismissal (WCAG 1.4.13):** it stays while the pointer is over the trigger or the tooltip itself, and Esc hides it without moving focus; it reappears on the next hover or focus.
2. **TimerRing `size="fluid"`.** `aspect-ratio: 1` with `width: min(100%, 100cqb)`, capped at `timer-full-size` with a minimum of 160. Digits already scale with `cqi`.
3. **Window tokens.** `window-min-width: 360px` and `window-min-height: 360px`, plus layout-class thresholds `layout-compact-width: 640px`, `layout-compact-height: 480px` and the strip rule (aspect > 2:1 and height < `layout-strip-height: 420px`). Replace "scroll below it" with the no-scroll rule for timer surfaces.
4. **NavRail compact rule.** Hidden below the compact threshold and replaced by a "Pages" menu button and ⌘1–6. It is never icons-only.
5. **Status row** (an InlineNotice `variant="row"`): a fixed 44px row, up to two lines of `body-sm`, a shape and words, no box, one optional ghost action at the 44×44 hit minimum, `role="status"`. Store lines are never truncated.
6. **FullScreenFocus.** A fluid ring, a Pause/Resume IconButton, the caption, an idle state with Start, and the window rule (borderless, sized to the chosen display, normal level, not native full screen).
7. **FloatingTimer** composition on MenuBarTimer `compact:false`: two always-visible IconButtons, a context menu with Close, minimum 248×56, default 280×64, and a `line-strong` border in dark.
8. **Settings patterns:** SettingsRow, a section list, a shortcut recorder (with the registration-failure line), and the *Single-key shortcuts* checkbox documented under the README's Accessibility section.
9. **Apps:** AppRow (apps and domains), AppPicker, and the **role glyph family**: hollow circle (Neutral), diamond outline (Distracting), shield outline (Always allowed), closed eye (Never record), globe (a site), each always with a word; Focus reuses the filled circle on purpose. **README rule:** mode shapes are reserved for modes; any other concept gets its own glyph.
10. **Segmented choice.** A radio group styled as one joined row, built on native radios at 44px with the `selection` ground and a check or word.
11. **Popover menu.** Native-like, arrow keys, Escape closes, focus returns.
12. **Theme override.** `:root[data-theme="light"|"dark"]` generated alongside `prefers-color-scheme`.
13. **StartButton.** The finish line moves into the summary line; `quickStart` stays visible beside Start at every size down to 360; a `compactLabel` ("Start", accessible name unchanged) is used only if the row would wrap; the pill gains a play glyph.
14. **Icon set.** play, pause, stop-square, expand, pip, gear, menu, close, eye-off, diamond, shield, hollow circle, globe, and replacements for the six rail icons (final notes, open item 6).
15. **Contrast verification for the new pairs.** Extend `verification/contrast.py` (D11's 106 passing pairs cover today's components only) in phase 2 with, in both themes: tooltip text on `surface-overlay`; the horizon bar fill and track against `surface` (3:1 as a UI mark); each role glyph against `surface` and `surface-raised`; the status-row text and its ghost action; the floater edge (`line` in light, `line-strong` in dark) against `surface` and against a mid-grey stand-in desktop. Nothing ships in phase 3 until these pass.

---

## 5. Three directions for Today

The review folded the original Direction B ("The Dial") into A: once its rim slots move out of the ring (they crowd below 220px and fail at 360×360, and End inside the ring sat next to Pause), B is A with a centre Start. So the three directions are now **A**, **A2** and **C**, and they are not mutually exclusive: A or A2 is Today's main layout, and C is the **strip layout** that Today switches to by shape.

### Direction A: "Still Point" (centered stage, recommended lead)

- **Layout:** a vertical, centered stage in a viewport-bounded grid of four rows: `[top row 44] [status row 44] [ring 1fr] [controls 52]`. Fixed parts total 188px at compact, so the ring is about 172 at 360×360, about 340 at 900×600 and 560 at full screen.
- **Top row:** a quiet preset summary, a text button reading "Classic · 25 min · ends 15:20", centered. A Focus-view IconButton sits right, and the Pages menu button sits left only when compact.
- **Status row:** always reserved; two lines of `body-sm` plus one ghost action ("See summary", "Got it"). Nothing ever pushes the controls.
- **The ring is the hero.** It is fluid and absorbs all spare space.
- **Below the ring, one fixed row of controls:**
  - idle: the "Start focus" pill (word plus play glyph) and a quiet "Just 2 minutes", both visible down to 360 wide;
  - running: a 52px circular Pause IconButton centered, with an End square IconButton set apart by `space-6` so it is never hit by accident;
  - paused: Resume replaces Pause.
- **Configuration lives elsewhere:** the summary opens a popover of four preset radios; minutes, notifications, theme and keyboard live in Settings; the Focus-view button opens the full-screen-per-display or floating menu each time.
- **What makes it distinct:** it keeps the ring-on-Today model the spec and the design system share, and changes only the *structure* (grid, fluid ring, status row), so the off-screen bug is fixed by construction. It is the lowest-risk build.
- **Its weakness:** in short, wide windows the ring is limited by height. That is exactly where C's strip layout takes over.

### Direction A2: "Still Point, centre Start" (A with the Dial's one good idea)

- **Layout:** identical to A (same four rows, same top row, same status row, same running controls row).
- **The one difference is idle:** the ring's centre *is* the Start target. A circular button layered over the idle ring (a separate element; TimerRing stays `role="timer"`, never a control) holds the play glyph and the visible word "Start focus", and fills the ring's inner disc (at least 120px across at 360×360). Click, Space or ⌘↩ starts.
- **Idle controls row:** only "Just 2 minutes" (quiet), so the row is calmer; the controls row keeps its 52px so nothing moves when the session starts and Pause/End appear there.
- **What makes it distinct:** the biggest possible target for the hardest moment (starting), at the place the eye already rests. No rim, no new composite component beyond a centred button.
- **Its costs:** the spatial constancy claim holds only while idle (the running controls are below the ring, as in A), and a ring that is both a display and, when idle, a button may read as two things to some users. Decide A vs A2 from the 360×360 idle mock in both themes.

### Direction C: "Horizon" (the strip layout)

- **Scope:** C is no longer a whole-Today alternative. It is the layout Today uses when the page is a **strip: wider than twice its height and shorter than 420px** (for example 900×240 under a monitor, or an ultrawide corner). Square or tall windows, including 360×360, keep the ring. Full screen and the floating timer always use the ring and MenuBarTimer respectively, so SPEC §2.1's "progress ring" and the README's ring rule stand with no amendment.
- **Layout:** a three-column strip. Left: the ModeChip and the status row text. Centre: large tabular digits (`timer-xl` scaled with `cqb`) over a thin **horizon bar** of time left (under reduce-motion it steps once a minute; otherwise it moves with `duration-calm`). Right: the controls, as in A (Start focus pill and Just 2 minutes; or Pause and End IconButtons). The preset summary and the Focus-view button stay in the top row, converging with A's chrome; nothing is crammed into a bottom dock.
- **States:** the chip is the state word; warning fades the bar and the chip to amber with the triangle (decided); idle shows "25 min · ends 15:20" in place of digits with the word "No session".
- **What makes it distinct:** it is the only composition that stays legible and calm in a strip, where a ring would be a small circle in a lot of empty width.
- **Its costs:** a linear bar is a weaker at-a-glance cue than a closing circle, which is why C is limited to the shape where a ring cannot work.

**Recommendation for phase 2 mock-ups:** mock A, A2 and C at **360×360, 900×600, 900×240 and 1440×900**, idle and running, both themes (C appears at 900×240; at the other sizes A and A2 are compared). Lead is **A**; adopt A2 only if its 360×360 idle mock reads as one calm object and the centre target is not mistaken for the timer. The strip trigger is by shape (aspect > 2:1 and height < 420), not by height alone.

---

## 6. Open design questions, with my call

1. **New minimum window size?** Call: **360×360** for the main window. The default stays 900×600. The floating timer is a separate window, **248×56 minimum, 280×64 default**.
2. **Keep the word on Start?** Call: **yes**. "Start focus" stays a pill with the word and a play glyph (A), or a centre target with the word (A2). Pause, Resume and End become icon-only, with tooltips that name the shortcut. Start is the moment of greatest hesitation for ADHD users, and a word lowers it.
3. **Confirm on End?** Call: **no dialog** (keeps spec A's accepted behaviour; the minutes are saved and counted). Accidental ends are prevented by shape and space instead: a square glyph, a ghost style, `space-6` apart from Pause, and never the Space-bar target. Revisit if dogfooding shows accidental ends.
4. **Notifications for existing installs.** Call: change the default to off (`ipc.rs:132`). On migration, if the OS status is still `notDetermined`, set `notifySessionEnd` to false so nobody is prompted. Remove the request from `timer_start` (`session.rs:504-507`). The request happens only when the user switches the toggle on. Remove the Today explanation line (`Today.tsx:369-371`). This needs an amendment note in spec A.
5. **Where does "Just 2 minutes" go in compact?** Call: **it stays visible beside Start at every size**, down to 360 wide (the idle row is 334px). No chevron or split button: that would be a new component, add a decision and hide the spec's lowest-cost start. If a larger text size ever makes the row wrap, the pill reads "Start" with the play glyph (accessible name "Start focus"). Settings › General can hide "Just 2 minutes".
6. **Global shortcut default.** Call: **⌃⌥F** for start/pause and **⌃⌥N** for capture, **on by default** (no permission needed for a registered hotkey). Not ⌃⌥Space: that is macOS's "Select the next input source", on by default for bilingual users. Registered once, globally; the menu-bar item shows it as inert text, never as a live accelerator. On registration failure the menu item drops the shortcut text and Settings › Keyboard shows "Another app uses this shortcut. Pick a different one." While VoiceOver runs, Settings › Keyboard notes that VoiceOver uses Control-Option keys (VO-F is its Find). Nothing else nags.
7. **Full screen: how, and on which display?** Call: **a dedicated Focus window that is borderless, sized to the chosen display, at normal level** (`collectionBehavior` `fullScreenAuxiliary` + `moveToActiveSpace`), **not macOS native full screen**, which blacks out other displays when "Displays have separate Spaces" is off. With more than one display, the Focus-view menu, the menu-bar menu and ⌘K list "Full screen on <NSScreen.localizedName>" per display, the main window's display first and bound to ⌘⇧F. One choice, no dragging. Nothing is remembered.
8. **The floating timer over full-screen apps?** Call: **yes, on all Spaces including full-screen ones**, using the non-activating panel technique proven by the spike (ADR-004). It never takes focus on its own; ⌘K "Floating timer", the menu-bar item and a click give it key focus without activating Orasenda.
9. **Does the second-screen choice show automatically on Start?** Call: **no**. Start never asks a question. The choice is one button or key (F) away, each time, and in the menu-bar menu.
10. **Visible page titles?** Call: keep visible titles on list pages (Board, Calendar, Routines, Review, Settings), where they orient. On Today the title is visually hidden; the summary line orients instead. Remove the brand and version header everywhere (the version moves to Settings › About).
11. **Duplicate state chip on Today.** Call: remove the outer `ModeChip` (`Today.tsx:276`); the ring's own chip is the state word. The menu bar, floater and full screen follow the same rule.
12. **Where does tracking and blocking setup live, and how are roles shown?** Call: **Settings › Apps and sites**, in two sections, Roles and Privacy. The rail stays at six items, and Review holds usage. Roles have their own glyph family, always with a word: Focus filled circle (deliberate overlap), Neutral hollow circle, Distracting diamond outline in `ink-muted` (never amber, never critical), Always allowed shield outline, Never record closed eye. Mode shapes are reserved for modes.
13. **Should never-recorded apps still be blockable?** Call: **yes**. Role and privacy are independent, so an app may appear in both sections. The blocking rule stores only the bundle id; usage never stores the name.
14. **Recent and foreground apps.** Call: there is no live display during focus. "Open now" exists only inside the Add apps picker. Usage appears in Review and, only when recording is on, as one per-session line after the session ends, with private apps pooled.
15. **Firm mode wait display.** Call: show the wall-clock time when Continue unlocks ("You can continue at 15:21"), not a ticking countdown.
16. **Theme setting and the native title bar.** Call: Settings › General sets `data-theme` on `<html>` and calls the Tauri window `set_theme` so the title bar and the menu-bar menu match. *Match system* removes both overrides.
17. **Preset change while running.** Call: the summary popover is read-only while a session runs ("Changes apply to your next session"). This prevents mid-session decisions.
18. **Today's finish time, and its name.** Call: one place only, the summary line, worded **"ends 15:20"**, both idle and running. `StartButton` loses its finish line on Today. The phrase **"Realistic finish" is reserved for P3's day-level estimate** and is not used for a single session.
19. **Layout test.** Call: add a Playwright WebKit test (Tauri's webview engine) for Today, Full screen and Floating at the minimum size, 900×600, 900×240 and 1440×900, with every message type shown (including the longest store line and a status action). It asserts the primary or control row is fully inside the viewport, that the status row is exactly 44px, and that `document.scrollingElement.scrollHeight <= innerHeight` on timer surfaces. jsdom cannot lay out, so the existing vitest suite cannot catch this.
20. **Do sub-projects B and C need re-scoping?** Call: the floating timer, full screen, the ⌘K palette and Settings (theme, timer, notifications, keyboard) move into the redesign ahead of B. E keeps export, import, backups and delete. Record this as a ROADMAP and spec-A amendment in phase 3.
21. **Single-key shortcuts.** Call: keep Space, F and P on Today (they serve the one-keystroke principle) but make them switchable with *Single-key shortcuts* in Settings › Keyboard, default on (WCAG 2.1.4). Every action they trigger also has a ⌘ combination or a focusable control.
22. **When does Today use the strip layout?** Call: by shape, when the content box is wider than twice its height and shorter than 420px. 360×360 keeps the ring.
23. **Phase 3 verification list additions.** Call: (a) one ⌃⌥F press while Orasenda is frontmost starts exactly once (no tray-accelerator double fire); (b) the global shortcut with VoiceOver on and off; (c) Full screen on a second display with "Displays have separate Spaces" both on and off, the main window staying usable; (d) the floater's keyboard path from ⌘K; (e) the new contrast pairs (§4 item 15).

---

## 7. Review response

Mapping each finding in `02-brief-critique.md` to what changed.

| # | Severity | Finding | What changed |
|---|---|---|---|
| 1 | blocker | Native full screen blacks out other displays; needs a drag | Full screen is now a borderless Focus window sized to the chosen display at normal level (`fullScreenAuxiliary` + `moveToActiveSpace`). With several displays the menus list "Full screen on <localizedName>" per display, main window's display first on ⌘⇧F. Nothing remembered. §2.3, §3.10, §3.12, §3.14, Q7, Q23c |
| 2 | major | ⌃⌥Space is the input-source shortcut | Default is ⌃⌥F (capture ⌃⌥N). Registration failure drops the menu shortcut text and shows the Settings line. §0, §2.2, §3.6, §3.10, §3.15, Q6. **Added beyond the fix:** ⌃⌥ is VoiceOver's modifier and VO-F is VoiceOver Find, so with VoiceOver on the shortcut does not reach Orasenda; Settings › Keyboard says so while VoiceOver runs, and the menu bar and ⌘↩ always work. Kept ⌃⌥F rather than a four-key chord because it is one comfortable keystroke for most users and the conflict is shown, not hidden |
| 3 | major | Role glyphs reuse mode shapes | New role glyph family (filled circle for Focus on purpose, hollow circle, diamond, shield, closed eye) always with a word; README rule "mode shapes are reserved for modes". §3.7, §4 items 9 and 14, Q12 |
| 4 | major | 18px status slot can't hold a 44px action | Status row is a fixed 44px with the ghost action inside it; fixed parts 188px, ring about 172 at 360×360. §1.1, §2.1, §3.1, §4 item 5, §5 A |
| 5 | major | Truncation hides store errors | Two lines of `body-sm` at compact; recovered notice shortened to "Session ended while Orasenda was closed."; store lines never truncated and covered by the layout test. §3.1, Q19 |
| 6 | major | Single-key shortcuts fail WCAG 2.1.4 | *Single-key shortcuts* checkbox (default on) in Settings › Keyboard, honoured by every single-key binding; ⌘ combinations always work; README Accessibility note. §2.2, §3.1, §3.3, §3.6, §3.7, Q21 |
| 7 | major | Floater geometry and keyboard path | Two always-visible buttons (Pause/Resume, Open Orasenda); Close via Esc, context menu and the menu-bar toggle. Minimum 248×56, default 280×64. ⌘K and the menu item open it with key focus; a click gives key focus without activating the app. §3.10, §3.11, §4 item 7, Q1, Q8 |
| 8 | major | Never record as a fourth group duplicates rows | Two sections: Roles (three groups; rows with glyph+word, Never record checkbox, Move menu) and Privacy (never-record list including Neutral apps, plus Pause recording with "Nothing is recorded while this is on."). An app may appear in both, stated. AppRow covers domains (P7). §3.7 |
| 9 | minor | Known-issue arithmetic | Corrected: 562 + 52 + 32 = 646, so the plain idle Today already overflows 900×600 by about 46px. §1.1 |
| 10 | minor | Chevron menu for "Just 2 minutes" | Dropped. Both buttons stay visible at 360; a wrap falls back to a "Start" pill label. §2.1, §3.1, §4 item 13, Q5 |
| 11 | minor | Tray accelerator could double-fire | Hotkey registered once globally; the menu shows it as inert text; added to the phase 3 verification list. §2.2, §3.10, Q23a |
| 12 | minor | "Custom 40/10" literal | The menu shows the saved custom values. §3.10 |
| 13 | minor | Tooltip dismissal | Stays while hovered; Esc hides it without moving focus. §3 conventions, §4 item 1 |
| 14 | minor | Contrast for new pairs; dark floater edge | `verification/contrast.py` extended in phase 2 with the listed pairs in both themes; floater gets a `line-strong` border in dark. §3.11, §4 item 15 |
| 15 | minor | "Realistic finish" naming; session line implies tracking | Summary says "ends 15:20"; "Realistic finish" reserved for P3. The per-session usage line exists only when recording is on and pools private apps. §3.8, Q14, Q18 |
| — | direction notes | B not viable as written; C contradicts the ring rule for full screen | B folded into A as **A2** (centre Start, no rim, same controls row); A vs A2 decided from the 360×360 idle mock. C limited to the **strip layout**, triggered by shape (aspect > 2:1 and height < 420); full screen and the floater stay on the ring and MenuBarTimer, so no spec amendment. C's summary moves to the top row. Mock sizes now include 900×240. §2.1, §5, Q22 |
