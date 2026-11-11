# Today redesign (P1 sub-project C) — Spec

- Status: approved (owner, 2026-11-11); implemented 2026-11-11
- Date: 2026-11-11
- Owner: Arnold Gandarillas Castillo
- Related: [#134](https://github.com/arkgast/orasenda/issues/134) (the P1 re-cut; comment 6780298891 is the Today canvas inventory this spec builds from), [#119](https://github.com/arkgast/orasenda/issues/119) (Start below the window), [#120](https://github.com/arkgast/orasenda/issues/120) (refused start, Today half), [spec A](2026-11-08-focus-session-loop.md) (amended here, see [Amends spec A](#amends-spec-a)), [Settings spec](2026-11-09-settings.md) (B; its compact layout and its harness handover are C's), [structure refactor spec](2026-11-10-structure-refactor.md) (the file layout C keeps), [SPEC §1](../SPEC.md), [ADR-011](../DECISIONS.md) (time is formatted in Rust), [ADR-013](../DECISIONS.md) (one Rust state, many surfaces), [ADR-014](../DECISIONS.md) (settings: one object, one save chain), [ADR-015](../DECISIONS.md) (code-first design system). Design source: the timer-surfaces canvas https://claude.ai/artifact/9pNxL32QEEq66j5QyAW1GX (`Today.dc.html`, verdict "approve"). Components: `packages/ui/src/components/ui/{timer-ring,timer-strip,start-button,popover-menu,inline-notice,icon-button,tooltip,mode-chip,kbd,nav-rail,page-frame,settings-index}.md`.

## TL;DR
- Today becomes the canvas's **Still Point**: one grid that fills the window with no scrolling: a top row, a 44px status row, the time, and the controls. The time is a fluid `TimerRing`, or a `TimerStrip` when the window is a strip (`timerLayout`). It works from **360×240** up, and 360×240 becomes the window minimum.
- The preset radios and Custom fields leave Today. A **preset summary** ("Classic · 25 min · ends 15:20") opens the design system's `PopoverMenu`, and Today always starts with `custom: null`. So a start can no longer be refused for its minutes: **the refused-start line and its "Open Settings" are dropped** (owner, 2026-11-11), and #120 closes as fixed by B's inline validation plus this change.
- Pause, Resume and End become `IconButton`s. The in-app shortcuts are ⌘↩, ⌘⇧↩, ⌘. and ⌘1–6. In compact windows the rail gives way to a **Pages** button that opens a native menu. The menu-bar menu gains Start, Just 2 minutes, a Preset submenu and a status header.
- The DevPanel leaves Today for its own debug-only window. A Playwright WebKit harness for the app checks every size and state in both themes, starting with #119's failing case.
- **No new design-system component.** Interim line icons live in the app (`app/glyphs.tsx`) until T7's `Icon` set lands. The Focus view button, "Commands… ⌘K", the floater, the warning and break states, Space/P/F and the shortcut recorder stay with D, E, F, T5 and T6.

## Change in a nutshell
Open Orasenda at its default 900×600, idle with Classic saved:

```
┌ rail ┬──────────────────────────────────────────────────────────────┐
│ ◯    │              Classic · 25 min · ends 15:20 ⌄                 │  44  top row
│ ▢    │                                                              │  44  status row (empty)
│ …    │                        ╭──────────╮                          │
│      │                        │  25:00   │   fluid ring             │  1fr time
│      │                        │ No session│                         │
│      │                        ╰──────────╯                          │
│      │              [ ▶ Start focus ]   Just 2 minutes              │  52  controls
└──────┴──────────────────────────────────────────────────────────────┘
```

Press ⌘↩. The summary reads "Classic · ends 15:20", the ring runs, and the controls become a round **Pause session** button and an **End session** icon button, with ⌘. as End's shortcut. When the session ends, the status row says "Session ended." and focus is on Start focus. Shrink the window to 360×240: the rail is replaced by a Pages button, and the time becomes a stacked strip. Nothing scrolls, Start stays fully visible, and every target stays at least 44px.

In general, every Today state at every window size from 360×240 to 1920×1080 shows its one primary action fully, in a grid whose rows never grow, and the WebKit harness checks this in light, dark and reduced motion.

## Problem
Today is still spec A's interim page: a fixed 280px ring, radios and Custom fields, and a notice slot that grows. At the 900×600 minimum, Start falls below the window after a session end or with Custom checked (#119). A refused Custom start shows only a field helper (#120). The owner wants to use Today every day while T5–T7 are built (owner, 2026-11-10), so it has to fit any window, match the design system, and keep one primary action.

## Goals / Success criteria
1. In the WebKit harness, for each size in [the size set](#sizes-and-layout) and each state in [the state set](#states), in light and dark: the document does not scroll on either axis, the primary action (Start focus, or Pause/Resume session) is fully inside the viewport, the status row is 44px tall, and every interactive element is at least 44×44.
2. The time view follows `timerLayout` at each size, and a fluid ring stays between 160 and 560px.
3. Tabbing through Today in each layout shows the 2px focus ring on every stop, in the [tab order](#focus-and-tab-order). Under reduced motion, nothing on Today animates.
4. Today never sends `custom` other than `null`, and has no preset radios, Custom fields or range helpers.
5. ⌘↩ starts (idle), ⌘⇧↩ starts Just 2 minutes (idle), ⌘. ends (running or paused), and ⌘1–6 open the six pages. Each control advertises its live shortcut through `aria-keyshortcuts`.
6. The menu-bar menu shows exactly the [items for each state](#menu-bar), and its actions go through the same session service as Today.
7. The window minimum is 360×240 and equals the `window-min-*` tokens (a test compares them). Settings and the placeholder pages work there too.
8. The DevPanel opens in its own window from a menu-bar item that exists only when `spike::enabled()`, and Today no longer renders it.
9. #119's acceptance passes: its harness case is written first, marked as an expected failure, and the Today task removes that mark.

## Non-goals
- **Focus view button and menu** (Full screen, Floating timer): D and T5. Its top-right grid cell is kept empty so D adds it without a layout change (owner, 2026-11-11).
- **"Commands… ⌘K"** in the Pages menu, and ⌘K itself: D (owner, 2026-11-11).
- **Final icons:** T7's `Icon` set replaces `app/glyphs.tsx` (owner, 2026-11-11). **Floater** (T5) and **shortcut recorder** (T6): not used by C.
- **Warning ("Almost up") and break states:** E. **Space, P, F and ⌃⌥F:** F (so `singleKeys` is never true in C), and so is the status row's ⌃⌥F tip.
- **The first-run welcome line** ("Welcome. Nothing to set up."). It needs a stored first-run flag, and only matters on a first install; it comes with the first sub-project that adds onboarding.
- **VoiceOver passes:** deferred to the end of P1 (owner, 2026-11-10). Reviews still check names and roles in code.
- **Screenshots:** none in PRs. The owner reviews the visuals by hand (owner, 2026-11-11).
- **A spacious breakpoint.** At 1280×800 and above, the fluid ring reaches its 560px ceiling (`timer-full-size`) by itself. Spacious is a size case in the harness, not a code path.

## Users & permissions
One local user, no accounts. The DevPanel window and its menu-bar item exist only in debug builds with `ORASENDA_SPIKE=1` (`spike::enabled()`, `apps/orasenda/src-tauri/src/spike/mod.rs:19`). The `dev` window gets a capability of its own for the spike commands, and the main window keeps only the commands it still uses.

| Role | Can | Cannot |
|---|---|---|
| User | start, pause, resume and end sessions; choose the preset from Today or the menu bar; switch pages | change Custom minutes on Today (Settings only) |
| Developer (spike enabled) | open the DevPanel window from the menu bar | see the DevPanel in a release build |

## Tenancy & localization
Single device, no tenancy. English copy only, as in A and B. Every clock time and remaining time is formatted in Rust (ADR-011). Whole minute counts the webview already holds as settings values (`25`, `45 / 10`) may be printed with a unit ("25 min", "25 / 5"), because no time is computed. That rule is stated here because the summary and the popover need it.

## Domain model
No new entities. Two derived values:
- **Next session**: the saved preset and its focus and break minutes, shown while idle. Classic 25/5, 50/10, Deep Block 90/15, or Custom from `settings.custom`.
- **This session**: `view.preset` plus its planned focus minutes, shown while running or paused. Its minutes come from the new `TimerView.plannedMin`, because Custom minutes can change in Settings during a session and the summary must not follow them.

Preset display names: Classic, 50/10, Deep Block, Custom, and Just 2 minutes (for `quick`). The webview and the tray each hold this short table, and a test on each side pins it.

## Interfaces

### IPC (Rust → `apps/orasenda/src/ipc/bindings.ts`, regenerated)
- `TimerView.plannedMin: number | null`: the session's planned focus minutes while running or paused, `null` when idle. The field is declared on `TimerView` in `crates/service/src/api/timer.rs:42` and filled in `crates/service/src/session/view.rs` from the engine's planned length. The same task corrects `ClockTick.idleFinish`'s doc comment, which says "if one is running" although `view.rs:49-57` sets it only while idle.
- `presets_get() -> PresetLength[]`, with `{ preset: Preset, focusMin: number, breakMin: number }` for `classic`, `fifty_ten` and `deep_block` from `crates/core`'s preset table. The webview reads it once per launch. Custom comes from settings, and `quick` is never listed.
- `native_menu_popup(request: { items: NativeMenuItem[], x: number, y: number }) -> string | null`, with `NativeMenuItem = { id: string, label: string, accelerator?: string, checked?: boolean }`. It shows a native menu at the window-relative logical point (the trigger's bottom-left), runs on the main thread, and answers with the chosen id, or `null` when the menu was dismissed. Pages and Jump to section use it. It lives in `src-tauri/src/commands/menu_popup.rs` and is added to `build.rs`'s `AppManifest` and granted in `capabilities/main.json`. A second call while a popup is open answers `null` without showing a second menu.
- Unchanged: `timer_start` (Today always sends `custom: null`), `timer_pause`, `timer_resume`, `timer_stop`, `settings_get`, `settings_set`, `settings-changed`, `navigate`, `clock-tick`.

### Window (`apps/orasenda/src-tauri/tauri.conf.json`)
`minWidth` 360 and `minHeight` 240 (from 900×600). The default size stays 900×600. A Rust test reads `tauri.conf.json` and `packages/tokens/tokens.json` and checks that the minimum equals `window-min-width` and `window-min-height`.

### Sizes and layout
`app/useWindowLayout.ts` reads the window's inner size on `resize` (never on a tick). It returns:
- `compact`: true when the width is under `--layout-compact-width` or the height is under `--layout-compact-height`. Both are read from the token CSS variables at mount, so no number is hard-coded.
- `timer`: `timerLayout({ contentWidth, contentHeight, windowWidth })`, where the content box is the window's inner size (TimerStrip README, "Today's box").

**The shell** (`app/App.tsx`, `styles/app.css`):
- The brand and version header is removed. The version stays in Settings › About and data, which already shows it.
- The `NavRail` renders only when not `compact`.
- Each page gets the full column.
- `.app` becomes a fixed, full-window box, so no page scrolls the document.

**Today's grid** (`features/today/Today.tsx` with `today.css`, every length a token):

| Layout | Rows | Columns | Padding |
|---|---|---|---|
| ring | `hit-min` top / `hit-min` status / `minmax(0,1fr)` time / `control-lg` controls | one, centred, at most `content-width` | `space-8`, or `space-4` when compact |
| strip | `hit-min` top / `minmax(0,1fr)` | areas `top top top / status time controls`; columns `minmax(180px,1fr) minmax(0,1.6fr) max-content` expressed with tokens, `space-8` column gap | as ring |
| stackedStrip | as ring | one | `space-3` × `space-4`, `space-2` row gap |

The 180px strip column has no token. The plan's first Today task either finds a token for it or names it as a ruling on its issue, with the owner's sign-off; no arbitrary value lands. The time cell holds `TimerRing size="fluid"`, or `TimerStrip` (`stacked` in stackedStrip). Today passes no `task` (E's) and gives `clock` to the ring from `clock-tick.clock`. The strip gets `idleLength` ("25 min") while idle.

**Size set** (the harness's cases): 360×240, 360×640, 480×320, 640×480, 800×300, 900×600, 1024×400, 1280×800, 1440×900, 1920×1080. This covers stackedStrip, ring-compact, strip, the smallest regular window, the default window, and spacious.

### Top row
- **Start:** the **Pages** `IconButton` (`app/PagesButton.tsx`), only when `compact`, with label "Pages", `shortcut={['⌘1','⌘2','⌘3','⌘4','⌘5','⌘6']}` and `shortcutLabel="⌘1–6"`, `aria-haspopup="menu"`. Clicking it calls `native_menu_popup` with the six pages (Today, Board, Calendar, Routines, Review, Settings), accelerators ⌘1–⌘6 and the current page checked. A chosen id navigates as the rail does.
- **Other pages when compact** *(author's call)*: Settings puts the Pages button, then its Jump to section button, in `PageFrame`'s existing `compactPicker` slot (no `PageFrame` change). The placeholder pages (`app/Placeholder.tsx`, no `PageFrame`) render a `hit-min` top row with the Pages button above their `EmptyState`. So every page has a visible way to navigate when compact.
- **Centre:** the **preset summary** (`features/today/PresetSummary.tsx`), a text button with a chevron (`app/glyphs.tsx`), wrapped in `Tooltip`.
- **End:** an empty `hit-min` cell, reserved for D's Focus view button.

| State | Visible text | Under 400px of content | Accessible name | Tooltip |
|---|---|---|---|---|
| idle | Classic · 25 min · ends 15:20 | 25 min · ends 15:20 | Preset Classic, 25 minutes, ends 15:20. Change preset | Change preset |
| idle, strip | Classic · ends 15:20 | ends 15:20 | as idle | Change preset |
| running | Classic · ends 15:20 | ends 15:20 | Preset Classic, ends 15:20. Preset details | Preset details |
| paused | Classic · 25 min | 25 min | Preset Classic, 25 minutes, paused. Preset details | Preset details |
| settings not loaded, idle | Presets unavailable | same | Presets unavailable (`aria-disabled`) | none |

Where each value comes from:
- "ends" while idle is `clock-tick.idleFinish`, and while running it is `view.finish`. When it is missing, the "· ends …" part is left out.
- Minutes are the next session's while idle and `view.plannedMin` otherwise.
- The short forms switch by a container query on the summary's own box (`--container-start-compact`, 400px), as StartButton does. The accessible name is always the full form.

**The popover** (`PopoverMenu`, anchored to the summary, `id` set, trigger `aria-expanded`/`aria-controls`):
- **Idle:**
  - heading "Preset for the next session";
  - line "Choosing one applies it and closes.";
  - radio rows Classic (meta "25 / 5"), 50/10 ("50 / 10"), Deep Block ("90 / 15") and Custom ("45 / 10" from the saved values);
  - a separator, then the link row "Edit times in Settings" with meta "⌘,".
- **Choosing:**
  - a radio saves `{ ...latest(), preset }` through `ipc/settingsQueue` (as today, `features/today/Today.tsx:137-141`);
  - the link opens Settings › Timer through the existing `SettingsTarget` path.
- **Running or paused:** `readOnly`, heading "<name> · <plannedMin> min" (for example "Classic · 25 min"), line "Presets can change between sessions.", and the Settings row live. For a `quick` session the heading is "Just 2 minutes" and no radio is checked.
- **Why the running heading omits the break** *(author's call)*: the canvas draws "Classic · 25 / 5", but the session holds no break length (breaks are E's; the store keeps only `planned_ms`). A Custom break edited in Settings mid-session would therefore show a value the session does not have. E restores "/ <break>" when sessions carry their break.

### Status row
The status row is `InlineNotice variant="row"` (`features/today/statusLine.ts` picks the line, as a pure function). It is the one live region on Today. Lines, in priority order:

| # | When | Tone | Text | Action | Clears |
|---|---|---|---|---|---|
| 1 | `timer_start` answered an error other than `alreadyRunning` | attention | "Focus didn't start. Orasenda's timer isn't responding." | quiet "Try again" (name "Try again starting focus"): repeats the same request | a successful start, or the next view change to running |
| 1 | `timer_pause`, `timer_resume` or `timer_stop` answered an error other than `nothingRunning`/`wrongState`/`alreadyRunning` | attention | "Orasenda's timer isn't responding." | none | the next successful command or view change |
| 1 | `timer_state` failed (useTimer error) | attention | "Timer unavailable. Restart Orasenda to try again." | none | never this launch |
| 2 | milestone `ended` | neutral | "Session ended." | none | the next transition |
| 2 | milestone `recovered` | neutral | "Your last session ended while Orasenda was closed." (spec A's wording, owner 2026-11-11) | none | the next transition |
| 3 | `view.store` is `unavailable` / `newer` | attention | "Orasenda can't save sessions right now." / "This data was saved by a newer Orasenda." | none | while the state lasts |

Rules for the row:
- **Joining:** a line of rank 2 and the store line join in one row ("Session ended. Orasenda can't save sessions right now.") when the two together are at most 65 characters. Otherwise the higher-ranked line shows alone, and the store line returns when it clears. A joined row takes its first sentence's tone.
- **Races are not failures:** `alreadyRunning`, `nothingRunning` and `wrongState` are races between surfaces (ADR-013). They are logged and the next view is the truth.
- **`invalidSpec` from `timer_start`** can't happen with `custom: null` and a saved, validated spec. If it ever does, it is treated as "any other start error" (rank 1, first row) and logged.
- **The README stays the contract** (ADR-015) *(author's call)*. The docs task rewrites the InlineNotice README's "Today slots" table to match the table above:
  - it removes the three refused-start rows (owner, 2026-11-11, ruling on #120);
  - it splits "Any other start error, or the timer unavailable" in two: a start error keeps "Focus didn't start. Orasenda's timer isn't responding." with Try again, and the timer that never answered at launch gets the canvas's "Timer unavailable. Restart Orasenda to try again.", because Try again would retry a start that can't work;
  - it adds the pause/resume/end failure row;
  - it notes that "Got it" appears on an ended row only when it is joined with a tip.
  The welcome and tip rows stay in the README for the sub-projects that build them (see Non-goals).

### Controls
- **Idle:** `StartButton` with:
  - `onStart` (preset from the latest settings, or `classic` while settings never loaded, as today, `Today.tsx:43,172`; `custom: null`);
  - `onQuickStart` (`preset: "quick"`);
  - no `finishTime`: the prop is deprecated (`packages/ui/src/components/ui/start-button.tsx:10-11`) and the finish time is in the preset summary, so it would show twice and add a line under the controls *(author's call)*;
  - `compactLabel="Start"`, `singleKeys={false}`;
  - `loading` while a start is in flight;
  - `unavailable` while the timer is unavailable.
- **Running or paused:**
  - `IconButton size="round"` "Pause session" (pause glyph), or "Resume session" (play glyph). It is the same element, so focus stays on it when it flips.
  - `IconButton size="md"` "End session" with `shortcut="⌘."`. The two sit `space-6` apart.
- **In the stacked strip:** the status row carries the `ModeChip` (InlineNotice README, "Anatomy").

### Focus and tab order
- **Tab order:** Pages (compact) or the rail → preset summary → status action → Start focus or Pause/Resume → Just 2 minutes or End session.
- **The `h1`:** "Today" stays the page's `h1`, visually hidden (`sr-only`) with `tabIndex={-1}`, and takes focus after a page change (unchanged contract).
- **Start, from idle:** focus moves to Pause session.
- **End, or a natural end while focus was on End or Pause:** focus moves to Start focus after the row's line has mounted (InlineNotice README, "Focus").
- **Elsewhere:** focus never moves on a tick or on a transition started from another surface.

### Shortcuts (`app/useShortcuts.ts`)
- **Listener:** one `keydown` listener on `window`, registered by `App`. It ignores events with `isComposing`, and events whose target is an editable field (Settings' inputs). Pages register their keys while mounted.
- **⌘1–⌘6 (App):** open Today, Board, Calendar, Routines, Review and Settings.
- **⌘↩ (Today):** Start focus while idle and not starting.
- **⌘⇧↩ (Today):** Just 2 minutes, under the same conditions.
- **⌘. (Today):** End session while running or paused.
- **Keys that do nothing:** in any other state the key does nothing and is not prevented.
- **`aria-keyshortcuts`:** a control advertises a shortcut only while it is live (StartButton `singleKeys={false}` gives `Meta+Enter`; End gives `Meta+Period`; Pages gives `Meta+1 … Meta+6`).

### Menu bar (`src-tauri/src/tray/`)

| State | Items, top to bottom (separators as `—`) |
|---|---|
| idle | Start focus · 25 min · Just 2 minutes · Preset ▸ — Show Orasenda · Settings… ⌘, — Quit Orasenda ⌘Q |
| running | *Focus · 18 minutes left · ends 15:20* (disabled header) — Pause session · End session — Show Orasenda · Settings… ⌘, — Quit Orasenda ⌘Q |
| paused | *Paused · 18 minutes left* (disabled header) — Resume session · End session — Show Orasenda · Settings… ⌘, — Quit Orasenda ⌘Q |
| spike enabled, any state | the above, plus "Developer panel" above Quit, in its own group |

Details:
- **Preset ▸** is a submenu: the four presets as check items, with the saved one checked and labels as in the popover ("Classic 25 / 5"). Then a separator and "Edit times in Settings…", which opens Settings › Timer. Choosing a preset saves it through the service's settings chain (ADR-014). That publishes `settings-changed`, so Today and Settings follow.
- **"Start focus · 25 min"** runs `Action::Start` with the saved preset and `custom: None`. "Just 2 minutes" runs it with `quick`.
- **The header's minutes** are `ceil(remaining_ms / 60 000)`, with "1 minute left" for one. They are formatted in Rust beside `tray_label` (`tray/render.rs`). The header changes with `set_text` once a minute; the menu is rebuilt only when its item list changes.
- **The tray learns of a settings change** through the same publish path as a view (`runtime/`), so the Start item's length and the checked preset follow Settings.
- **"Settings… ⌘," and "Quit Orasenda ⌘Q"** show their accelerators.
- Everything is spec A's threading contract, unchanged (`tray/mod.rs` module doc).

### DevPanel window
- **Opening it:** "Developer panel" opens (or focuses) a window labelled `dev` (default 480×640, resizable, its own title "Developer panel"). It loads `dev.html` → `src/dev/devMain.tsx` → `DevPanel`, unchanged inside.
- **Where it lives:** the window is created in `src-tauri/src/spike/` only when `spike::enabled()`. The tray item comes from the same check.
- **Permissions:** `capabilities/dev.json` grants it the spike commands. `Today.tsx` no longer imports `DevPanel`. `vite.config.ts` adds `dev.html` as an input, as it does for `overlay.html`.

## Behavior & edge cases
- **Preset change while running:** the popover is read-only. The menu bar has no Preset submenu while a session runs, and Settings may still change the saved preset, which applies to the next session (spec A, unchanged).
- **Settings fail to load:** the summary shows "Presets unavailable" (`aria-disabled`, focusable, no popover), Start still works (above), and the error is logged. `settings-changed` later fills it in.
- **A preset save fails:** `settingsQueue` rolls Today back to the last saved value (unchanged). A failed write also turns `view.store` to `unavailable`, so the store line explains it. Today adds no copy of its own.
- **A start from the menu bar or another window while Today is open:** the view changes to running. No line shows and focus doesn't move.
- **A natural end while the window is hidden:** on show, the row says "Session ended." and focus is wherever it was.
- **Resizing across a layout boundary** remounts only the time view. Focus inside the controls or the summary is kept, because those elements stay mounted. Ring and strip switch on resize only.
- **An open popover on resize to compact or strip:** it stays open and Radix re-places it. **Esc** closes it and returns focus to the summary.
- **A second `native_menu_popup`** while one is open answers `null`.
- **Pages on placeholder pages and Settings when compact:** as in [Top row](#top-row).
- **Pages menu while Settings is current:** Settings is checked, and choosing it again does nothing (the existing `navigate` guard).
- **Reduced motion:** the ring and strip already drop their motion (their READMEs). Today adds no motion.
- **Both themes:** every colour is a token. The harness runs both themes.

## Data & migrations
No schema change. `TimerView` gains `plannedMin` and the bindings are regenerated. The service computes `plannedMin` for a restored session from its stored planned length, so recovery needs no new data.

## Testing strategy
**Rust:**
- `crates/service`: `view_planned_min_{idle_none,running,paused,quick}` and `presets_get_lists_three_fixed_presets`.
- `src-tauri/tray/tests.rs`: `menu_items_{idle,running,paused,spike}`, `header_minutes_ceil_and_singular`, `preset_submenu_checks_saved`, `start_item_uses_saved_preset_and_no_custom`, `settings_change_rerenders_menu`.
- `src-tauri/commands/menu_popup.rs`: a pure model of item building and of the "already open answers null" rule.
- `src-tauri/src/window_min_tests.rs`: `window_minimum_equals_tokens`.
- `spike/`: `dev_window_only_when_enabled` (pure, `enabled_from`).

**Vitest (`apps/orasenda/src`), split by behaviour beside the file:**
- `features/today/Today.start.test.tsx`: start, quick, ⌘↩/⌘⇧↩, starting guard, `custom: null`, focus moves.
- `Today.controls.test.tsx`: pause/resume/end, ⌘., focus kept on flip.
- `statusLine.test.ts`: every row, priority, joining at 65 characters, races.
- `Today.notices.test.tsx`: the live region mounts once per line.
- `PresetSummary.test.tsx`: the table above, names and tooltips, the popover idle/running/quick, the Settings link.
- `app/useShortcuts.test.ts`, `app/useWindowLayout.test.ts` (the compact rule against stubbed sizes) and `app/PagesButton.test.tsx` (the popup request, navigation, the null answer).
- The existing `Today.presets/ranges/saves` tests are replaced: preset saving is now `PresetSummary`'s, and ranges are Settings'.

**WebKit harness (`just layout`, macOS):**
- **Harness setup:**
  - `apps/orasenda/layout.html` and `src/dev/layout/{layoutMain.tsx,scenarios.ts}` render `App` against `mockIPC`, with a scenario per state chosen by query string, as in #119's notes.
  - These files are dev-only, never a build input.
  - `verification/layout/playwright.config.ts` adds a second `webServer` (`pnpm --filter orasenda exec vite --port 4180 --strictPort`).
- **Today specs** (`verification/layout/today.{fits,focus,motion}.spec.ts`): goals 1–3 across the size set × [states](#states). `today.fits` starts as #119's case: 900×600 × {idle, ended, Custom checked} with `test.fail()` against today's page. The Today task removes the mark.
- **Other pages:** `appShell.spec.ts` (rail vs Pages on every page, a visible Pages button on each placeholder page when compact, no scroll) and `settings.spec.ts`. The latter covers B's handover: 900×600 and 1440×900 with the longest save line beside *Show* and the denied-on line, plus 360×240 and 480×320 compact.
- **No new dependency:** Playwright is already the harness's.

#### States
The state set: idle, idle after an end, recovered, running, paused, store unavailable joined with "Session ended.", start error, timer unavailable, starting, the popover open (idle and running), settings unavailable.

**Review checklist (the opus reviewer ticks it per UI PR, decision 1):** each state above at 360×240, 900×600 and 1440×900 in both themes: one primary, no colour-only state (word or shape beside every tint), no red for time, copy kind and plain with no exclamation marks, the focus ring visible, targets ≥ 44px, and the tab order as listed.

**Manual (owner, at the end of C):**
- the visuals of each state in both themes (no screenshots in PRs);
- ⌘↩, ⌘⇧↩, ⌘. and ⌘1–6 in the bundled app's WKWebView;
- the Pages and Jump to section native menus;
- the menu-bar menu in each state, the Preset submenu, and the header changing each minute;
- the Developer panel window in a spike build.

## Decisions
No ADR. C follows ADR-011, ADR-013, ADR-014 and ADR-015. Rulings made for this spec (owner, 2026-11-11), each to be recorded on its issue:

| # | Ruling | Issue |
|---|---|---|
| 1 | Design match: the WebKit harness plus the per-state review checklist above. The owner reviews the visuals by hand, with no screenshots. | #134 |
| 2 | DevPanel: its own debug-only window, opened from a debug-only menu-bar item. | #134 |
| 3 | No refused-start line on Today, because Settings and Rust refuse out-of-range minutes before they are saved. The recovered line keeps spec A's wording. | #120, #134 |
| 4 | Focus view button: omitted, and its cell kept. | #134 |
| 5 | T5–T7: floater and recorder skipped; interim icons in `app/glyphs.tsx` (Lucide geometry, 20-unit grid, 1.5 stroke, round caps), swapped by T7. | #134, #174 |
| 6 | Pages menu: the six pages only, with "Commands… ⌘K" waiting for D. | #134 |

No new terms for `CONTEXT.md`.

## Amends spec A
Each amendment is edited into [spec A](2026-11-08-focus-session-loop.md) in this spec's PR, with the dated note "Amended 2026-11-11 by the Today redesign spec". Line numbers are spec A's before the edits.

| Spec A line | Was | Now |
|---|---|---|
| 210, Menu bar | Items *Pause*/*Resume*, *End session*, *Show Orasenda*, *Quit Orasenda* | The [menu-bar table](#menu-bar) above. |
| 218, Today | Fixed ring, ModeChip, radios and Custom fields, text buttons, notice slot under the ring | This spec's Today: the grid, the summary and popover, the IconButtons and the status row, which together cover what A's Today did. |
| 220, App shell | The DevPanel under Today's content | The DevPanel in its own debug window. The header is removed, and the rail is hidden when compact. |
| 224, Custom out of range | `invalidSpec` from `timer_start` shows the field helpers on Today | `invalidSpec` is shown only in Settings (B). Today sends `custom: null` and has no range helpers. |
| 237, Settings save fails | "…until C gives Today its status row" | Today adds no copy. The store line in its status row covers a failed write. |

## FAQ
### Why drop the refused-start line instead of keeping it as a backstop?
Nothing can reach it. `settings_set` refuses out-of-range Custom minutes in Rust, Settings refuses them beside the field before sending, and Today sends `custom: null`. A line for an impossible state costs copy, tests and review, and would hide a real bug behind a plausible message. If `invalidSpec` ever comes back, it shows as the generic start error and is logged.

### Why a native popup for Pages instead of `PopoverMenu`?
The NavRail and SettingsIndex READMEs both specify a native menu, and `PopoverMenu` is "the one in-webview menu, for a choice that needs radios and a heading". One small command serves both Pages and Jump to section.

### Why handle shortcuts in the webview instead of app-menu accelerators?
The shortcuts are per-page and per-state (⌘. only while a session runs). A webview listener knows the page and the state without a round trip, and is testable in Vitest. Menu accelerators would also add a new top-level menu that the design doesn't draw. The owner checks the keys in the bundled app's WKWebView.

### Why remove the brand and version header?
The canvas has none. At 360×240, Settings needs every pixel for its header, status row and region, and the version already shows in Settings › About and data.

### Why `plannedMin` in the view instead of reading settings?
Custom minutes can change in Settings while a session runs. The paused summary and the read-only popover must describe the session that is running, not the next one.

## Open questions
None.

## Implementation status
Plan: [docs/plans/2026-11-11-today-redesign.md](../plans/2026-11-11-today-redesign.md). All merged 2026-11-11.
- [x] Harness, #119's case first (C1 #296, PR #305)
- [x] IPC: `plannedMin`, `presets_get`, `native_menu_popup` (C2 #297, PR #306)
- [x] Shell: 360×240 minimum, compact rule, Pages, glyphs, ⌘1–6 (C3 #300, PR #311)
- [x] Today: grid, time view, controls, status row, ⌘↩/⌘⇧↩/⌘. (C4 #301, PR #314; closes #119 and #120; rulings on #301)
- [x] Today: preset summary and popover (C5 #302, PR #317; rulings on #302)
- [x] Settings compact (C6 #303, PR #313)
- [x] Menu bar (C7 #298, PR #307)
- [x] DevPanel window (C8 #304, PR #310)
- [x] InlineNotice README Today slots (C9 #299, PR #308; design system v41)
- [x] Follow-ups: "Edit times in Settings…" opens Settings › Timer (C10 #309, PR #312); rail focus ring (#315, PR #316); PopoverMenu height cap (#318, PR #319; design system v43). The `layout-strip-status-min` token came with C4 (design system v42).
