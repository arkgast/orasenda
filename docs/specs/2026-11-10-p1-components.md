# P1 Components — Spec

- Status: approved (2026-11-10); partly superseded by [the code-first spec](2026-11-10-code-first-components.md) (2026-11-10, see the note below)
- Date: 2026-11-10
- Owner: Arnold Gandarillas Castillo
- Related: [ROADMAP, P1 sub-projects](../ROADMAP.md#p1-sub-projects) (amended here: this sub-project sits between B and C, unlettered), [issue #134](https://github.com/arkgast/orasenda/issues/134) (the P1 re-cut ruling, amended by a dated note in the ROADMAP), [#119](https://github.com/arkgast/orasenda/issues/119) (Start below the window; its Today test stays in C), [#149](https://github.com/arkgast/orasenda/issues/149) (third-party licence notices; the bundled fonts add to it), [#61](https://github.com/arkgast/orasenda/issues/61) (pre-beta device pass), the Settings [spec](2026-11-09-settings.md) and [plan](../plans/2026-11-09-settings.md) (how B built its seven components design-first: #142, PR #152, PR #159), design-pass review [`design/reviews/04-redesign-pass.md`](../../design/reviews/04-redesign-pass.md) and its [changeset](../../design/reviews/04-redesign-pass/04-ds-changeset.md), [`design/system/README.md`](../../design/system/README.md), [`docs/conventions.md`](../conventions.md) ("Design-system changes are checked against their first consumer"), [CONTEXT.md](../../CONTEXT.md), the live design system https://claude.ai/artifact/Sk5N75HzRwY8v7dBxhsH73.

> **Superseded in part (2026-11-10, [ADR-015](../DECISIONS.md#adr-015-code-first-design-system-on-shadcn-tailwind-and-radix), [code-first spec](2026-11-10-code-first-components.md)).** The minimum macOS is now 15.8.2, so the [Engine baseline](#engine-baseline) table (macOS 13, Safari 16) no longer applies. The design-first steps in [How each task runs](#how-each-task-runs) (artifact first, byte-for-byte refresh of `design/system/`, `just ui-css`) no longer apply: components are TSX in `packages/ui` and the artifact is published from `main`. The contracts, the inventory's consumers, the size cases, the Testing strategy and the T5–T7 scope still hold; T5 (#172), T6 (#173) and T7 (#174) resume in TSX after the wave each depends on.

## TL;DR
- A new P1 sub-project, **Components**, between B and C. It builds, design-first, every design-system component that P1's remaining screens (C Today, D Focus views, E Session cadence, F Hotkeys and capture, G Data portability) need, before any of those screens is built. The owner asked for this on 2026-11-10: "all components ready, and implement the screens one by one, functionality + UI".
- **Scope is P1's screens only** (approved by the owner on 2026-11-10). It covers 8 new components and the redesign props of 5 existing ones, plus a shared icon set, a key table and a layout rule function. Components for later phases wait for those phases: the planning components (TaskCard, KanbanColumn, RoutineItem, NowLine, IntentPrompt, `SessionSlot`, `Select`) and the tracking and blocking components (AppRow, RoleTag, AppPicker, BarRow, `Dialog emphasis="safe"`). Their screens have no behaviour yet, so nothing could check them against a consumer.
- **The real-engine checks move here from C.** These are the Playwright WebKit layout harness, the bundled fonts it measures with, and `verification/contrast.py` in `ci.sh`. A fluid ring, a strip and a 280×56 floater can't be checked in jsdom. C keeps the Today page cases, which include #119's failing test, and writes them on this harness after Components closes. The harness proves layout on current WebKit; what macOS 13's WebKit supports is settled from compatibility data and owed to the device pass (#61).
- **The "first consumer" check, for components whose screens don't exist yet**, has three parts:
  1. a component test;
  2. a specimen in the WebKit harness in both themes, with reduced motion and keyboard runs;
  3. a review against the approved screen-group canvas and the README slot tables of the screen that will consume the component.

  The consumer screen and its sub-project are named for each component.
- **Size: seven tasks, one PR each, in series.** Every design-first task republishes the same artifact and rewrites the same `bundle.js`, so no two can run at once. The final icons are the last task, so the owner's approval of the glyphs is off the critical path.

## Change in a nutshell
When this sub-project closes, C's first screen task can write Today's paused controls from `@orasenda/ui` without a design-system round of its own:

```tsx
import { Icon, IconButton, StartButton, TimerRing, TimerStrip, timerLayout } from "@orasenda/ui";

// box: the timer region's content box (ResizeObserver); window: the window's inner size.
const layout = timerLayout({ contentWidth: box.width, contentHeight: box.height, windowWidth: window.innerWidth });
{layout === "ring"
  ? <TimerRing size="fluid" mode="paused" remaining="18:42" remainingLabel="18 minutes 42 seconds" progress={0.25} />
  : <TimerStrip mode="paused" remaining="18:42" remainingLabel="18 minutes 42 seconds" progress={0.25} stacked={layout === "stackedStrip"} />}
<IconButton size="round" label="Resume session" icon={<Icon name="play" />} shortcut={singleKeys ? "Space" : undefined} onClick={resume} />
<IconButton label="End session" icon={<Icon name="stop" />} shortcut="⌘." onClick={end} />
```

Each of these is in `window.Orasenda` and exported from `packages/ui/index.ts`. Each has a jsdom test in `packages/ui` and a specimen page that the harness renders in WebKit. That page is served by Vite from `packages/ui/specimens/` (`just specimens` serves it for a person too) and loads the real Atkinson Hyperlegible fonts from files in the repo. The specimen is checked in light and dark, with reduced motion, by keyboard, and at the README's sizes. `just ci` runs the harness (macOS only) and `verification/contrast.py`. The design system's `index.d.ts` no longer marks any P1 component "Not implemented in bundle.js yet".

In general: for each component below, (1) the artifact is updated and republished, (2) `design/system/` is refreshed from it byte for byte, and (3) `packages/ui` is regenerated, exported and tested, all in one PR. The app's screens don't change, apart from three small visible changes listed under Behavior.

## Problem
The redesign pass (2026-11-09) settled every P1 screen on canvases and wrote the component contracts into the design system's READMEs and `index.d.ts`. Most of those contracts have no runtime:
- `IconButton`, `Tooltip`, `Kbd`, `TimerStrip`, `FloatingTimer`, `PopoverMenu` and `ShortcutRecorder` are typed (`design/system/components/index.d.ts:89-110`) and styled (`bundle.css:236-274`, `:343`), but `bundle.js` never defines them. The export list at `bundle.js:339` has 27 components and none of these.
- The redesign props of `TimerRing`, `StartButton`, `FullScreenFocus` and `CommandPalette` sit in `*NextProps` interfaces marked "Not implemented in bundle.js yet" (`index.d.ts:66-88`). The bundle still draws the old designs:
  - a numeric ring only (`bundle.js:40`);
  - "Realistic finish" under Start, with no play glyph (`bundle.js:272-274`);
  - a ghost "Leave full screen" button and a fixed 560px ring (`bundle.js:178-184`);
  - no shortcut column and a text Close in the palette (`bundle.js:248-268`).
- `NavRail` gives every item its own tab stop (`bundle.js:235-241`). Its README asks for one roving tab stop.
- `CapturePad` still uses the pre-redesign copy (`bundle.js:210-212`).
- The final icons don't exist: the README lists them as owed (`design/system/README.md:136`, "Icon set").

B showed the cost of building components inside a screen sub-project. Its design-system task needed a second round, and then a follow-up PR, once the first page used it (`docs/conventions.md:89-102`). Doing that five more times, once in each of C–G, is the alternative this spec replaces.

## Goals / Success criteria
1. `window.Orasenda` (`bundle.js`) and `@orasenda/ui` (`packages/ui/index.ts`) export the new P1 components: `Icon`, `IconButton`, `Tooltip`, `Kbd`, `TimerStrip`, `PopoverMenu`, `FloatingTimer` and `ShortcutRecorder`. They also export the functions `timerLayout` and `describeShortcut`. The `exports_*` test in `packages/ui/index.test.tsx` lists all of them.
2. The redesign props of `TimerRing`, `StartButton`, `FullScreenFocus` and `CommandPalette` (with `Command.shortcut`) move onto their `*Props`. Their `*NextProps` interfaces are deleted. After the last task, `index.d.ts` declares exactly six `*NextProps`, all for later phases: `TaskCard`, `RoutineItem`, `IntentPrompt`, `Dialog`, `KanbanColumn` and `NowLine`.
3. Every component in the [inventory](#inventory) marked "to build" has the following. A task closes only when (a)–(d) hold in its PR:
   - (a) jsdom tests in `packages/ui`;
   - (b) a specimen in `packages/ui/specimens/` that renders every state the README names, plus `break` and `warning` for the timers, in `data-theme="light"` and `"dark"`;
   - (c) WebKit harness runs over that specimen with the cases listed under [Testing strategy](#testing-strategy): layout, hit targets, keyboard, reduced motion and the accessibility tree;
   - (d) its colour pairs in `verification/contrast-pairs.json`, passing `verification/contrast.py` in both themes;
   - (e) a VoiceOver pass in Safari over the specimen, done once per component by the owner (see [Testing strategy](#testing-strategy)). It is listed under "Not yet verified" in the task's PR and ticked in this spec's Implementation status. The sub-project closes only when every component's pass is ticked.
4. `just ci` runs `verification/contrast.py` on every platform. On macOS it also runs the layout harness (`just layout`). A pair under its threshold fails the contrast check, and a specimen that overflows its box fails the harness. Each failure is shown by a test that seeds one. The GitHub `ci` job (macOS) installs and caches Playwright's WebKit; both jobs get a working Python 3.
5. The harness renders with the bundled fonts:
   - Atkinson Hyperlegible Next, Atkinson Hyperlegible Mono and Lexend, as the upstream variable `woff2` files (roman, `wght` axis) under `packages/tokens/fonts/`, unmodified, with their OFL licence texts;
   - `@font-face` rules generated into `tokens.css` from `type.fonts` in `tokens.json`;
   - each harness run asserts `document.fonts.check(...)` for every family at every weight the type styles use, and that no request reaches a font CDN.
6. The current app keeps working with no app code changes. `pnpm --filter orasenda typecheck` and `test` pass. `Today.tsx` keeps passing `finishTime` to `StartButton` (`apps/orasenda/src/pages/Today.tsx:272`) and keeps its numeric `TimerRing` size, and both still render as before.
7. `docs/ROADMAP.md`:
   - places Components between B and C, with no letter renamed;
   - updates the C–G scope cells so that none of them builds these components;
   - carries a dated note on #134's ruling.

## Non-goals
- **Screens and app wiring.** No page, window, menu, IPC command, Rust code or setting changes. Which shortcut is live, the Single-key shortcuts setting, the Focus window, the floater panel, the capture panel and Settings › Keyboard are each built by their own screen sub-project.
- **Components for later phases.** The planning `*NextProps` (`TaskCard`, `KanbanColumn`, `RoutineItem`, `NowLine`) and `IntentPrompt` variants. `Dialog emphasis="safe"` (Strong lock, P6). `SessionSlot` (a planning page's header while a session runs, P2). `Select` (compact planning pickers and the AppPicker's "Add as", P2–P5). `AppRow`, `RoleTag`, `AppPicker` and `BarRow` (P5/P6). The role glyphs in the icon set (P5).
- **Choice variants.** `segmented` and `long` are CSS-only already. Their consumers are planning and blocking.
- **Committed screenshot baselines.** Text rendering differs between machines and macOS versions, so the harness asserts measurements and the accessibility tree. Screenshots are attached to each PR, not compared.
- **Device-only checks:** forced colours, Increase Contrast, VoiceOver in WKWebView, native menus, and the layout and features of the system WebKit on macOS 13. These stay with each screen's acceptance and the pre-beta device pass (#61).
- **Removing deprecated props.** `StartButton.finishTime` and `disabled`, and the numeric `TimerRing.size`, stay working. Dropping them is a later cleanup, not owed by C.
- **Windows layout checks and Windows key glyphs.** The harness targets macOS's engine, so it is skipped elsewhere, as `just mobile` is. The key table is Mac glyphs only in P1 (see [Key table](#key-table)).
- **Font subsetting.** The upstream files ship as they are (see FAQ, fonts).

## Users & permissions
One local user. Nothing here is a command or a capability. `bundle.js` runs in the webview with the page's existing rights.

| Caller | Can | Cannot |
|---|---|---|
| App code (C–G) | Import the components, `timerLayout` and `describeShortcut`; pass in data, shortcut strings and the `singleKeys` flag | Expect a component to read a setting, the store or the clock |
| The artifact's preview | Render every component from `bundle.js` with the CDN fonts | Ship its font `@import` (`packages/ui/build.ts` strips it today) |

## Tenancy & localization
n/a for tenancy: one user, one device. Copy is English only, as in the rest of P1. Components receive every time string already formatted by Rust (ADR-011) and never compute time. Layout uses logical properties (`inset-inline`, `padding-inline`), as `bundle.css` already does. Measuring localised copy lengths stays owed, as in [the redesign record §7](../../design/reviews/04-redesign-pass.md).

## Domain model
No product entities. The units are design-system components, each with one owner task:

- **Inventory row:** a component, its state (built already / to build / later phase), the redesign contract it implements (README plus `index.d.ts`), the screen that first consumes it and that screen's sub-project, and the task that builds it.
- **Specimen:** one page per component in `packages/ui/specimens/`. It renders every state the README names in fixed-size frames, in both themes. The harness, the VoiceOver pass and the PR screenshots all read it. A specimen never adds behaviour the component lacks.
- **Declared pair:** one entry in `verification/contrast-pairs.json`: `{ fg, bg, kind: "text" | "mark", where }`. `contrast.py` checks it in light and dark against `tokens.json` (4.5:1 for text, 3:1 for marks). Floater entries add `wallpaper: ["#EDEDED", "#808080", "#1C1C1E"]` and the rule "fill or edge holds 3:1" (`FloatingTimer` README).

Invariants:
- Components own no state beyond what is on screen: open, hovered, recording, the roving index.
- Components never read the Single-key shortcuts setting. The host passes what is live:
  - A generic control (`IconButton`, `Tooltip`, `Kbd`) gets a `shortcut` glyph string only when that shortcut is live.
  - A component that names its own keys gets `singleKeys?: boolean`. These are `StartButton` (its `aria-keyshortcuts` is `Space Meta+Enter` or `Meta+Enter`), `FullScreenFocus` (its caption) and `PopoverMenu` (its P key).
  - One key table in `bundle.js` maps a glyph string to its ARIA form (`⌘.` → `Meta+Period`) and to its spoken words (`⌃⌥F` → "Control-Option-F"). It is tested both ways (see [Key table](#key-table)).
- Any id that another element must reference can be set by a prop (`docs/conventions.md:102`).
- A component adds a live region only where its README names one (`docs/conventions.md:98-101`).
- Copy in components follows the principles: no "!", no emoji. `critical` appears only in `Dialog destructive` and `Button variant="critical"`. A jsdom test guards all three (see [Testing strategy](#testing-strategy)).

## Interfaces

### Inventory
Built means `bundle.js` implements the README contract today. Line numbers are from `design/system/components/`.

| Component | State | What is built | First consumer screen (sub-project) | Task |
|---|---|---|---|---|
| `Button`, `ModeChip`, `Input`, `TextArea`, `EmptyState`, `Toast`, `Choice` (CSS) | built | none | Every screen (C–G) | none |
| `InlineNotice` `variant="row"` with `actionVariant` | built (`bundle.js:217-228`, #152) | none | Today status row (C); Settings rows (E, F, G) | none |
| `PageFrame`, `ScrollRegion`, `SettingsIndex`, `SettingsRow` | built (B) | none | Compact Settings (C), Settings › Keyboard (F), About and data (G), Inbox (F) | none |
| `Dialog` (default, `destructive`, `scrim`) | built (`bundle.js:134`) | none | Leave full screen (D, through `FullScreenFocus`), Delete all data (G) | none |
| `MenuBarTimer` (React form) | built (`bundle.js:53`) | none (the native item is Rust's) | Inside `FloatingTimer` (D) | none |
| **`IconButton`** | to build | README contract (`md`, `round`, built-in `Tooltip`, `aria-keyshortcuts` from `shortcut`, `aria-haspopup`). Takes `icon: ReactNode`, so it needs no final glyph | Today Pause/Resume/End, Pages, Jump to section (C); Focus view, Leave full screen, floater (D) | T2 |
| **`Tooltip`** | to build | README contract (hover after `duration-quick`; on focus only after a keyboard event; Esc hides; stays while hovered; shown above an open modal dialog, technique under [Engine baseline](#engine-baseline)) | Preset summary "Change preset" (C), every `IconButton` | T2 |
| **`Kbd`** | to build | README contract (`spoken` required in text, hidden glyph) | The ⌃⌥F tip (C, F), the palette shortcut column (D), Settings › Keyboard list (F) | T2 |
| **`describeShortcut`** (key table) | to build (new function) | See [Key table](#key-table) | Every `IconButton` with a shortcut (C, D), `Kbd` hosts (D, F), `ShortcutRecorder` (F) | T2 |
| `TimerRing` | `TimerRingNextProps` (`index.d.ts:68`) | `size="fluid"`; the warning colour fade on `duration-slow` (today the arc and chip use `duration-calm`, `bundle.css:38,49`) | Today (C), Focus window (D), break and warning states (E) | T3 |
| **`TimerStrip`** | to build | README contract (digits ≥ `timer-md`, 10px bar, triangle, idle length, stacked form) | Today strip and stacked strip (C), Focus window strip (D), states (E) | T3 |
| **`timerLayout`** | to build (new function) | See [timerLayout](#timerlayout). Pure; Today and the Focus window share it; called on resize only | Today (C), Focus window (D, through `FullScreenFocus`) | T3 |
| `StartButton` | `StartButtonNextProps` (`index.d.ts:86`) | Play glyph (drawn inline, as the mode shapes are; it moves to `Icon` in T7), `compactLabel`, `unavailable`, `singleKeys` for `aria-keyshortcuts`. `finishTime` and `disabled` still render but are marked deprecated | Today (C), Focus window idle (D) | T3 |
| **`PopoverMenu`** | to build | README contract (radio, checkbox and link rows, read-only state, Focus-window form with no Settings row, ↑/↓, Return/Space, Esc returns focus to the trigger) | Preset summary on Today (C) and in the Focus window (D) | T4 |
| `FullScreenFocus` | `FullScreenFocusNextProps` (`index.d.ts:78`) | Fluid ring or strip through `timerLayout`, measured on its own box; Leave `IconButton` (Esc) with "Stay in full screen" as the initial focus; Pause/Resume and End; idle state; the `singleKeys` caption; "Session ended." | Focus window (D); its break and warning states (E's last task) | T5 |
| **`FloatingTimer`** | to build | README contract: `MenuBarTimer` inside, plus Pause/Resume and Open `IconButton`s; running, paused, warning, idle, ended and deep, plus break for E, at 280×56, 280×64 and 360×96 | Floating timer panel (D); its states (E's last task) | T5 |
| `CommandPalette` | `CommandPaletteNextProps`, `CommandNext` (`index.d.ts:82-84`) | `Command.shortcut` as a right-aligned `Kbd`; `compact` with a Close `IconButton` | ⌘K (D) | T6 |
| `CapturePad` | built, copy gap | Redesign copy (description, the ⌘↩ helper, the line explaining the chosen kind); ⌘↩ saves | Capture panel (F) | T6 |
| **`ShortcutRecorder`** | to build | README contract (record, cancel, ⌫ off, restore default, conflict line, name composed with `aria-labelledby`, settable `id`); emits canonical glyph strings | Settings › Keyboard (F) | T6 |
| **`Icon`** | to build (new) | One component, `name` from the closed union `IconName`, 20px grid, 1.5 stroke, round caps and joins, `aria-hidden`: play, pause, stop (square), expand, collapse, window, menu, chevron, close, back, alert, info, and the six final rail icons. Owner approves the glyph sheet before merge | Every `IconButton`, Start, the rail (C, D) | T7 |
| `NavRail` | built, contract gap | Roving tab stop (↑/↓, Return/Space); final rail icons from `Icon` | App shell on every page (C) | T7 |
| `SessionSlot`, `Select` | typed, no runtime | none | Planning page headers and pickers (P2–P3), AppPicker (P5) | later phase |
| `TaskCard`, `KanbanColumn`, `RoutineItem`, `NowLine`, `IntentPrompt`, `Dialog` `safe` (`*NextProps`) | redesign contract only | none | Planning (P2–P4), blocking (P6) | later phase |
| `AppRow`, `RoleTag`, `AppPicker`, `BarRow` | typed, no runtime | none | Apps and sites, Review usage (P5/P6) | later phase |
| `HabitDots`, `TimeBlock`, `WellnessNote` | built, later phase | none | Habits, Calendar, wellness notes (P2–P4) | none |

`design/system/components/Cover/` is the design system's cover page in the preview, not a component; it has no runtime and no consumer.

**E's components.** E's breaks and the two-minute warning are `mode="break"` and `mode="warning"` on `TimerRing`, `TimerStrip`, `FloatingTimer` and `FullScreenFocus`. Every specimen draws these states, because the canvases never drew the break arc ([redesign record §7](../../design/reviews/04-redesign-pass.md), timer surfaces). E's keep-going prompt and *Skip break* are compositions of `InlineNotice variant="row"` and `Button`, and E's spec draws them.

**E's intent line.** The intent ("What will be done?", `docs/SPEC.md:41`; stored in `focus_session.intent`, `docs/specs/2026-11-08-focus-session-loop.md:139`) is entered with `Input` before Start and shown during the session in `TimerRing`'s existing `task` slot (`TimerRing/README.md:6`: clamped to two lines, whole in the accessible name), and in `TimerStrip`'s and `FullScreenFocus`'s matching slot. That slot is built here: T3 and T5 specimens render a two-line intent in every state. Where it sits on Today and how it is entered was never drawn ("task and intent inside the ring" is undrawn, `04-redesign-pass.md:205`), so E's spec draws it. If E's canvas needs more than `Input` plus the `task` slot, E makes a small design-first touch recorded in its own spec. No intent component is built here.

**G's components.** G's rows and its one `critical` button use `SettingsRow` and `Dialog destructive`, which are built already.

### Engine baseline
The app's minimum is macOS 13.0 (`apps/orasenda/src-tauri/tauri.conf.json:39`). WKWebView uses the system WebKit, and on a Mac that never updated Safari that is Safari 16.0's engine. Playwright's WebKit is a patched current build, so the harness proves layout on current WebKit only. The feature baseline comes from compatibility data (MDN browser-compat-data, caniuse), not from the harness:

| Feature | Safari | On the macOS 13 baseline | Use |
|---|---|---|---|
| `dialog.showModal()` and its top layer | 15.4 | yes | `Dialog`, `CapturePad`, `CommandPalette` (already in use) |
| `:focus-visible` | 15.4 | yes | Focus rings; the Tooltip's keyboard-only flag |
| Container queries, `container-type` | 16.0 | yes | Fluid ring, strip, floater |
| `inert` | 15.5 | yes | Background while a menu or dialog is open |
| Popover API (`popover`, top layer for non-modals) | 17.0 | **no** | Not used |
| CSS anchor positioning | 26.0 | **no** | Not used |

So `PopoverMenu` and `Tooltip` don't use the popover API or anchor positioning. Each is a positioned panel placed by script from the trigger's `getBoundingClientRect()`, flipped to stay inside the viewport, and re-placed on resize and scroll. To appear above a modal, the panel is rendered inside the nearest open `<dialog>` (which is already in the top layer); otherwise in the page root. This is the T2 and T4 contract-gap choice, written into their READMEs in the artifact. The harness checks the layout. Whether the macOS 13 system WebKit renders it the same way is owed to #61, which gains a line for it.

### Key table
`describeShortcut(glyphs: string): { aria: string; spoken: string }`, exported from `bundle.js` and `@orasenda/ui` (T2, artifact first, in `index.d.ts` and a "Shortcut glyphs" section of the `Kbd` README).
- The input is a canonical glyph string: modifiers in macOS order `⌃⌥⇧⌘`, then one key (`F`, `.`, `↩`, `Space`, `Esc`, `⌫`, arrows). `⌃⌥F` gives `{ aria: "Control+Alt+F", spoken: "Control-Option-F" }`; `⌘.` gives `{ aria: "Meta+Period", spoken: "Command-Period" }`.
- `IconButton`, `Tooltip` and `StartButton` use it internally. Hosts call it to fill `Kbd`'s required `spoken` and a palette command's shortcut.
- `ShortcutRecorder` emits canonical glyph strings, and a test round-trips every key the recorder can produce through `describeShortcut`. An unknown key throws in tests and returns the glyphs unchanged as `spoken` in production.
- Windows: P1 ships Mac glyphs only. When Windows UI arrives, the table gains a platform argument (`Ctrl+Alt+F` text form); the function's name and return shape stay. Stored bindings are F's concern (Rust maps glyphs to accelerators).

### timerLayout
`timerLayout(box: { contentWidth: number; contentHeight: number; windowWidth: number }): "ring" | "strip" | "stackedStrip"` (T3, artifact first: a declaration in `index.d.ts` and a "Choosing the layout" section in the `TimerStrip` README).
- `contentWidth` and `contentHeight` are the timer region's content box. On Today that is the page's content column (capped at `content-width`) between the header and the status row. In the Focus window it is the window minus its margins (`space-8`, or `space-4` below `layout-compact-width`). `windowWidth` is the window's inner width, used only for the compact test, because the README's "from `layout-compact-width` wide" is a window threshold (`design/system/README.md:52`).
- Rule: if `contentHeight < layout-ring-min-height`, the result is `strip` when `windowWidth >= layout-compact-width`, else `stackedStrip`. Otherwise, if `contentWidth > 2 × contentHeight` and `contentHeight < layout-strip-height`, it is `strip`. Otherwise it is `ring`.
- Today's host measures its region and calls it. `FullScreenFocus` measures its own box with a `ResizeObserver` and calls it internally, so D passes nothing.
- The T3 artifact round writes the expected results into the README, using the content boxes from the a-timer canvas. The spec's expectation, which T3's unit test checks:

| Window | Today | Focus window |
|---|---|---|
| 360×240 | stackedStrip | stackedStrip |
| 360×360 | stackedStrip | stackedStrip |
| 640×330 | strip | strip |
| 640×480 | ring | ring |
| 900×240 | strip | strip |
| 900×600 | ring | ring |
| 1000×440 | strip (compact window; region under `layout-ring-min-height`) | strip (936×376 box: wider than twice its height, under `layout-strip-height`) |
| 1440×900 | ring | ring |
| 3440×400 | strip | strip |
| 1280×720, 1920×1080 | n/a | ring |

If the canvas's content boxes give a different Today result at any size, the README's value wins and the PR says which row changed.

### Contract gaps each task settles in the artifact first
Each gap below is a README or `index.d.ts` change. It is made in the artifact before any code, recorded in the task's PR, and then implemented. New contracts count as gaps: nothing is added to `packages/ui` that the artifact doesn't declare.
- **T1.** `type.fonts` in `tokens.json` (families, files, weight ranges). The README's Type line ("`type.fonts` is empty") and Colour line ("to be added as `verification/contrast.py`") are changed to say both exist.
- **T2.** `IconButton` and `Tooltip`:
  - the `shortcut` prop takes one canonical glyph string. Its ARIA form and spoken form come from `describeShortcut`;
  - the `id` prop passes through;
  - the Tooltip's placement is a positioned panel inside the nearest open dialog or the page root ([Engine baseline](#engine-baseline)).

  The key table: `describeShortcut` in `index.d.ts` and the `Kbd` README's "Shortcut glyphs" section.
- **T3.** `StartButton` gains `singleKeys?: boolean` (default `true`). `TimerRing` warning: the arc and chip colour transition uses `duration-slow`. `TimerStrip` gains `stacked?: boolean`. `timerLayout` in `index.d.ts` and the README section above.
  Amended 2026-11-10 (controller ruling, plan planner decision 11; #170): when `singleKeys` is left out, `StartButton` renders no `aria-keyshortcuts`, exactly as today; `true` gives `Space Meta+Enter` and `false` gives `Meta+Enter`. The host passes it only while those keys are live.
- **T4.** `PopoverMenu`:
  - it anchors to its trigger, which carries `aria-expanded` and `aria-controls` (the menu's `id` is settable);
  - it is a positioned panel, not the popover API ([Engine baseline](#engine-baseline)).
- **T5.** `FullScreenFocus`:
  - gains `summary?: React.ReactNode` (the host's preset summary trigger, which opens its `PopoverMenu`), `singleKeys?: boolean` and `ended?: boolean`. The `onPause`, `onResume`, `onEnd` and `onStart` props stay.

  `FloatingTimer`:
  - gains `ended?: boolean`;
  - names where "Session ended." is announced once. Because the floater is a window of its own, its README must name a live region, or the host must announce it;
  - passes `data-*` attributes through to its body, so the host can mark the drag region (`data-tauri-drag-region`) without the component knowing Tauri. Always-on-top, the window frame and the context menu are the host's (D).
- **T6.** `CapturePad`:
  - the README says the pad announces "Saved to Inbox." once, but the pad closes on success, so it cannot announce from a closed dialog. The README is changed so that the host announces it. The pad adds no live region besides its existing error line.

  `CommandPalette`:
  - `compact` is a prop. The host sets it below `layout-compact-height`.

  `ShortcutRecorder`: it emits canonical glyph strings (the key table's form).
- **T7.** The `Icon` component: its README and preview card (a sheet of every glyph in both themes), `Icon`, `IconProps` and the `IconName` union in `index.d.ts`. `NavRail`: roving tab stop and the final rail icons. `StartButton` and the specimens switch to `Icon`.

### Exports at the end
`window.Orasenda` and `packages/ui/index.ts` add `Icon`, `IconButton`, `Tooltip`, `Kbd`, `TimerStrip`, `timerLayout`, `describeShortcut`, `PopoverMenu`, `FloatingTimer` and `ShortcutRecorder`. They also add the type `IconName`. The `declare global` block in `index.d.ts` lists them. `packages/ui/build.ts` and the `ui-css` staleness diff in `ci.sh` are unchanged.

### Harness and checks
- `verification/layout/`: `playwright.config.ts` with WebKit projects for `light`, `dark` and `light-reduced-motion`, and one `*.spec.ts` per component. The base URL is a Vite server for `packages/ui/specimens/`. `just layout` runs it; `just specimens` starts the same server for a person (the VoiceOver pass and screenshots). The `ci` recipe runs `layout` after the ui tests on macOS and skips it elsewhere, as `mobile` does (`justfile:145-148`).
- `verification/contrast.py`: Python 3, standard library only. It reads `design/system/tokens.json` and `verification/contrast-pairs.json` and prints each pair's ratios for both themes. It exits non-zero on any failure. `just contrast` runs it with a `python` variable in the `justfile` (`python3` on macOS and Linux, `python` on Windows), and the `ci` recipe runs it before the tokens step. It is seeded with the pairs computed in [the changeset §9](../../design/reviews/04-redesign-pass/04-ds-changeset.md) and the `FloatingTimer` and `TimerStrip` README tables.
- `.github/workflows/ci.yml` (T1):
  - both jobs add a pinned `actions/setup-python` step (Python 3.13), so `contrast.py` never depends on the runner image's aliases;
  - the macOS `ci` job caches `~/Library/Caches/ms-playwright` keyed on the Playwright version from `pnpm-lock.yaml`, and runs `pnpm exec playwright install webkit` before `./scripts/ci.sh`;
  - both steps are skipped on the docs-only path, like the other installs.
- `./scripts/ci.sh` stays a one-line wrapper for `just ci` (`scripts/ci.sh:3`). There is one list of checks.
- New dev dependencies go through `baton:deps` in T1: `@playwright/test` (pinned, with its WebKit build) and `vite` for the specimen server in `packages/ui`.

## Behavior & edge cases
- **Three small visible changes in the current app:**
  - **Fonts (T1).** `tokens.css` starts loading the bundled families, so Today and Settings render in Atkinson Hyperlegible on Macs that don't have it installed. The harness has no `app` project yet, so T1 re-checks B's Settings page by hand: `pnpm tauri dev`, at 900×600 and 1440×900 in both themes, the page doesn't scroll and no line is clipped. The four screenshots go in the PR.
  - **The rail (T7).** It becomes one tab stop and takes the final icons.
  - **`TimerRing` warning fade (T3).** It changes from `duration-calm` to `duration-slow`. A only shows `focus`, `paused` and `idle`, so nobody sees the fade until E.
- **Compatibility.** Every change to an existing component adds to it. The current props keep their current output, so app code needs no change (Goal 6). Before each task's artifact round, the implementer folds that task's `*NextProps` into its `*Props` in a scratch copy of `index.d.ts` and runs `pnpm --filter orasenda typecheck`, so a break shows before the republish. If it breaks, the task stops and the orchestrator rules (opus; fable only if the ruling changes scope), as B's T1 did (plan ruling 6). App files are never edited here.
- **Real-engine-only behaviour** is asserted in WebKit, not jsdom:
  - the fluid ring's diameter;
  - strip and floater overflow;
  - `:focus-visible` after programmatic focus (the Tooltip's keyboard-event flag);
  - a Tooltip and a `PopoverMenu` placed inside an open `showModal()` dialog are visible above it;
  - `container-type` sizing;
  - the reduced-motion computed durations of transitions and animations.
- **Fonts fail to load.** The harness fails. It never measures with a fallback font, because a fallback measurement is not evidence of the real layout.
- **A WebKit or Playwright download is missing offline.** `just layout` fails with the install command to run (`pnpm exec playwright install webkit`). It never silently skips on macOS.
- **Playwright has no WebKit for the host's macOS.** T1's first acceptance check: the pinned Playwright installs and launches WebKit on the CI runner (`macos-26`) and on the owner's machine (macOS 27). If either fails, T1 stops and asks, before any other T1 work. Options then are a newer Playwright, or running the harness on CI only.
- **The harness is flaky in CI.** It asserts measurements, not screenshots, and runs with `retries: 0` locally and `retries: 1` in CI with a trace on retry. A case that needs its retry is reported in the PR; a case that fails twice fails `ci`, which is a required check.
- **The artifact and the repo disagree.** Under design-first, nothing in `design/system/` is edited by hand. A task whose refresh would differ from the republished artifact stops. Each PR links the artifact version it refreshed from (`design-system.json` `lastChange`). See [How each task runs](#how-each-task-runs).
- **A consumer spec finds a gap later.** If C–G's spec finds a contract this sub-project got wrong, that sub-project fixes it with a small design-first touch, recorded in its own spec, as B did for `InlineNotice` `actionVariant` (#134, comment 3). This sub-project is not reopened.

## Data & migrations
None: no store, schema or IPC change. `design/system/tokens.json` changes only in `type.fonts` (T1, artifact first), and `packages/tokens/tokens.css` is regenerated. Font files and their licences are added under `packages/tokens/fonts/`.

Fonts (T1):
- Atkinson Hyperlegible Next and Atkinson Hyperlegible Mono from the Braille Institute's releases (the `googlefonts/atkinson-hyperlegible-next` and `-mono` repositories), Lexend from `googlefonts/lexend`. Each is the upstream variable `woff2`, roman only, unmodified. The type styles use sans 400, 500 and 600, mono 300, 400 and 500, and alt 400 (`design/system/tokens.json`, `type.groups`); one variable file per family covers them. No style is italic.
- Each family's `OFL.txt` sits beside its file. The OFL allows bundling unmodified fonts with software. Subsetting would make a Modified Version and could touch a Reserved Font Name, so it is not done.
- Lexend has no P1 consumer (reading comfort is a later setting), but ships now because the README says the fonts ship inside the app and `--font-alt` names it (`design/system/README.md:42-45`).
- The PR states the added bundle size. #149 gains the three notices.
- Amended 2026-11-10 (controller ruling on #168, https://github.com/arkgast/orasenda/issues/168#issuecomment-6758234020): `googlefonts/lexend` ships no variable roman `woff2`, so Lexend ships as its unmodified upstream static `Lexend-Regular.woff2` (`font-weight: 400`, the only weight `alt` uses); the Atkinson families stay variable.

## Testing strategy
For every task:
- **Component tests** (jsdom, `packages/ui`, written first). These check roles and accessible names, which ids are linked, which props pass through, keyboard handlers, that no live region is added unless its README names one, and that every state renders its word or shape. The task's PR lists its test names.
- **Copy and colour guard** (jsdom, T1, then extended by every task): a test scans the string literals in `bundle.js` for "!" in user-facing copy and for emoji, and checks that the `critical` class and token are used only by `Dialog` destructive and `Button variant="critical"`.
- **WebKit harness** on the specimen, in every theme project:
  - every state renders inside its frame (`scrollWidth <= clientWidth`, `scrollHeight <= clientHeight`);
  - every focusable element's box is at least `hit-min` (44×44) in both dimensions, or the larger size its README states (`round` 52×52). This covers `PopoverMenu` rows, `StartButton` and its compact form, `ShortcutRecorder` controls, the floater's buttons at 280×56, palette rows and Close;
  - the focus ring is visible and not clipped by an ancestor;
  - the keyboard path from the README works with `page.keyboard` only;
  - `toMatchAriaSnapshot` matches the README's VoiceOver names;
  - under `light-reduced-motion`, every element has computed `transition-duration` 0s and `animation-name: none` (or `animation-duration` 0s).
- Per-task size cases, taken from the README's case list (`design/system/README.md:53`):
  - **T1:** the seed specimen (`TimerRing` and `InlineNotice variant="row"` at 360 wide with "Open Settings"); one seeded overflow fails; `document.fonts.check` for every family and weight.
  - **T2:** a Tooltip at 40ch on two lines with its `Kbd` unbroken. A Tooltip inside an open `Dialog` is visible over it. `IconButton` hit boxes are ≥ 44×44 (`md`) and 52×52 (`round`). `describeShortcut` round-trips every glyph in the table.
  - **T3:** the fluid ring in containers from 160 to 1200px. Its diameter is clamped to [`timer-min-size`, `timer-full-size`], and its digits' computed font size is ≥ `timer-md`. `TimerStrip` and its stacked form at 360, 640 and 1440 wide, with a two-line intent in the `task` slot. `timerLayout` is unit-tested against the [table](#timerlayout), and its constants are checked against `tokens.json`. `StartButton` at 399 and 400px of content shows "Start" and then "Start focus", and its name stays "Start focus".
  - **T4:** the menu fits at 360 wide. Esc returns focus to the trigger. The read-only form marks its radios `aria-disabled`. Inside an open `Dialog`, the menu is visible and placed against its trigger.
  - **T5:** the `FullScreenFocus` specimen at 1280×720, 1920×1080 and a strip-shaped frame. The `FloatingTimer` at 280×56, 280×64 and 360×96 in each of running, paused, warning, idle, ended, deep (1:30:00) and break, each over the three wallpaper colours as plain CSS backgrounds. The floater's fill is opaque `surface-raised` (its README), so no vibrancy is simulated.
  - **T6:** the palette's compact form at 360×240. A long command's label and hint wrap without hiding the `Kbd`. `ShortcutRecorder` keeps a conflict line within `panel-width`, and its output round-trips through `describeShortcut`.
  - **T7:** the glyph sheet at 20px in both themes; each glyph is `aria-hidden`; rail roving focus (↑/↓ moves, Tab leaves, one tab stop).
- **Contrast:** `contrast.py` passes with the task's new pairs. A self-test seeds one failing pair and one floater combination where both fill and edge fail.
- **VoiceOver (manual, owner).** The owner runs `just specimens`, opens each new specimen in Safari with VoiceOver on, and walks every state with VO-Right and Tab. What was spoken is recorded as a short transcript, one line per state, in a comment on the task's PR or, if the PR has merged, on this spec's tracking issue. The accessibility-tree snapshot in the harness is the merge gate; the VoiceOver pass is not, so a task can merge while it is listed under "Not yet verified". The passes are batched: the owner can do them any time before Components closes. WKWebView's own VoiceOver behaviour, including `aria-keyshortcuts` (e-onboarding-14), is owed to the consuming screen's acceptance.
- **Both themes by eye:** the PR attaches light and dark screenshots of the specimen from the harness.
- **Review:** the reviewer reads the approved screen-group canvas and the README slot tables for the consumer named in the inventory, and checks each component against them. Because the consumer spec doesn't exist yet, the canvas and README stand in for it (`docs/conventions.md:95-97`). The canvases are artifacts linked from [the redesign record §5](../../design/reviews/04-redesign-pass.md) (`04-redesign-pass.md:101-105`); the repo keeps only their reviews. Per task: T2, T3, T5 and T7 use the timer-surfaces canvas (https://claude.ai/artifact/9pNxL32QEEq66j5QyAW1GX) and, for T2's `Kbd` and T7's rail, the Settings canvas (https://claude.ai/artifact/GrTgYRHtYxbKh7RVBpbQn1); T4 uses the timer-surfaces canvas; T6 uses the Settings canvas (Keyboard) and the onboarding canvas (https://claude.ai/artifact/XPG6fXqiVfT8y1gTxpzKoz) for the capture pad and the welcome tip.
- **No regressions:** `pnpm --filter orasenda test` and `typecheck`, `pnpm --filter @orasenda/ui test` and `./scripts/ci.sh` pass.

## Decisions
No ADR. Every choice here binds only this sub-project, or follows a rule the design system already states: the engine and the case list are in `design/system/README.md`, and the bundled fonts are in its Type section. These choices are explained in the FAQ.

`CONTEXT.md` gains **Specimen** and **First-consumer check**.

### How each task runs
B's way (`docs/plans/2026-11-09-settings.md:25`, `:252-261`), made explicit:
1. After the previous task's PR merges, the orchestrator asks Claude to "update the Orasenda design system". Claude reads the live artifact, settles the task's contract gaps, writes the components by hand in the artifact's `bundle.js` and `bundle.css` (there is no build step behind them), updates the READMEs and `index.d.ts`, and republishes. The republish is one new version; `design-system.json` `lastChange` names it.
2. An implementer refreshes `design/system/` from the published files of that version (`Artifact` read with `paths`), byte for byte. Determinism isn't needed: the version is fixed once published, and the refresh copies it rather than regenerating it. If the live version is newer than the one named by the orchestrator, someone else republished, and the task stops.
3. The implementer regenerates `packages/ui` (`just ui-css`), exports the components and writes the tests and specimens. A fix the review asks for in a component goes back through step 1 as a new version; it is never patched in `design/system/` or `packages/ui` alone.
4. The PR runs the checks listed under Testing strategy and links the artifact version.

### Tasks (one PR each; target met: 7)
The tasks run in series (see FAQ). C starts after Components closes (see FAQ).

| # | Task | Builds | Consumers | Depends on |
|---|---|---|---|---|
| **T1** | Real-engine harness, bundled fonts and the contrast check | First: the pinned Playwright launches WebKit on macOS 26 (CI) and 27 (owner), else stop and ask. `verification/layout/`, the specimen server (`just layout`, `just specimens`) and a seed specimen; the copy and colour guard; fonts under `packages/tokens/fonts/` and `type.fonts` (artifact first); `verification/contrast.py` and its pairs with the `python` just variable; `layout` and `contrast` in `ci`; `ci.yml` setup-python on both jobs and the cached WebKit install on macOS; the README lines on fonts and `contrast.py` (artifact first); the manual Settings font check | All later tasks; C's Today cases | none |
| **T2** | The small controls and the key table | `IconButton`, `Tooltip`, `Kbd`, `describeShortcut`. Specimens use the current placeholder glyphs through `icon: ReactNode` | C, D, F | T1 |
| **T3** | Timer faces and Start | `TimerRing` fluid and the warning fade, `TimerStrip` (with `stacked`), `timerLayout`, `StartButton` redesign | C, D, E | T2 |
| **T4** | The preset popover | `PopoverMenu` | C, D | T2 (in series after T3) |
| **T5** | Focus window and floater | `FullScreenFocus` redesign, `FloatingTimer` | D, E | T3, T4 |
| **T6** | Commands, capture and the shortcut recorder | `CommandPalette` redesign, `CapturePad` copy, `ShortcutRecorder` | D, F | T2 (in series after T5) |
| **T7** | The icon set and the rail | `Icon` and `IconName`, the final glyphs (the owner approves the glyph sheet in the artifact preview before the PR merges), `NavRail` roving focus and final rail icons, `StartButton` and specimens switched to `Icon` | C, D | T6. The glyphs are drawn early, after T2, on a separate draft canvas artifact that the owner reviews while T3–T6 run; T7's design-system republish waits for T6 |

Every task closes with: both themes checked, the keyboard path, hit targets, the accessibility-tree snapshot, reduced motion, contrast through `contrast.py`, and `./scripts/ci.sh` green. Its VoiceOver pass is listed under "Not yet verified" until the owner records it. T7's PR also ticks this spec's Implementation status.

Who draws the glyphs: Claude, in the artifact, as SVG paths on a 20px grid with a 1.5px stroke and round caps and joins, matching the rail's existing line icons (`design/system/README.md:133`). The style reference is owner question 2. The owner's approval of the sheet is T7's gate, not T2's.

## FAQ
### Why build P1's components before its screens?
The owner asked for it on 2026-11-10: "ideally we should be having all components ready and implement the different screens one by one so we implement functionality + UI." It also removes a design-system round from each of C–G. In B, that round cost a second #152 review and a follow-up PR (#159).

### Why only P1's screens, not every component the design system declares? (owner question 1)
The owner said "all components". This spec reads it as all the components the next screens need, and asks the owner to confirm. `docs/conventions.md:89` says a design-system change is checked against its first consumer. The planning and blocking screens have no behaviour, no spec and no IPC yet. Their components could only be checked against a canvas, and they would sit unused for a whole phase or more. Those components are: `TaskCard`, `KanbanColumn`, `RoutineItem`, `NowLine`, `IntentPrompt` variants, `Dialog safe`, `SessionSlot`, `Select`, `AppRow`, `RoleTag`, `AppPicker` and `BarRow`. Each later phase builds its own, design-first, the way this sub-project does. If the owner wants them now, they become a second sub-project after this one, with the same checks.

### What counts as the "first consumer" check when the consumer doesn't exist yet?
It has three parts. The component test and the WebKit specimen prove the README contract in a real engine, in both themes. The review against the approved canvas and the README slot tables of the named consumer stands in for the consumer spec's accessibility acceptance. If the screen's own spec later finds a gap, that sub-project fixes it with a small design-first touch, and this sub-project is not reopened.

### Why does the layout harness move here from C?
Three of this sub-project's components can't be checked without real layout: the fluid ring, the strip and the floater at 280×56. `container-type`, `:focus-visible` after programmatic focus and the top layer also behave differently in jsdom. If the harness stayed in C, T3 and T5 would ship with their main risk unverified, and C would find any problem after the fact. What moves is the harness, the fonts it needs and the contrast script. C keeps the Today cases, #119's failing test included, written on this harness as C's first task.

### Why does C wait until Components closes?
It could start its Today test task after T1, but that task adds an `app` project to `verification/layout/playwright.config.ts`, which T2–T7 also edit, and it commits #119's failing test, which would need `test.fail()` to keep CI green. Waiting is simpler and matches the owner's order: components first, then screens one by one.

### Why Playwright WebKit and not the app's own WKWebView?
The README already names it as the layout test (`design/system/README.md:53`). It runs headless in CI on macOS and can emulate reduced motion and the colour scheme. It is a current WebKit build, not the system WKWebView, so it proves layout on current WebKit only. Features are chosen from the [macOS 13 baseline](#engine-baseline) by compatibility data, and the old-engine check is owed to the device pass (#61). VoiceOver and native menus still need the real app, and they stay with each screen's acceptance.

### Why bundle the fonts now?
A layout measured with a fallback font doesn't show how the real layout behaves. The README says the fonts ship inside the app and that the preview's CDN import must not ship. `type.fonts` is empty only because the files weren't in the repo yet (`design/system/tokens.json:40`). The OFL requires the licence text to travel with the fonts, and #149 (third-party notices, release precondition) gains them as an item.

### Why is the contrast check Python, given the repo has none?
The design system already names the file `verification/contrast.py` (`design/system/README.md`, Colour). It uses only the standard library. `python3` ships with the macOS command-line tools; CI gets a pinned Python from `actions/setup-python` on both jobs, and the `justfile` picks `python` on Windows, where `python3` can be missing or the Store alias. Renaming it would mean a design-first README change for no gain.

### Why seven serial tasks rather than parallel waves?
Every task republishes the same artifact and rewrites `bundle.js`, `bundle.css`, `index.d.ts`, `design-system.json` and `packages/ui/index.ts`. The ownership rule (no two concurrent tasks edit one file) therefore forces a series. The next task's republish starts only after the previous PR merges. The icons are split from the small controls so that the owner's approval of the glyphs doesn't hold up T3–T6.

### Why does the host pass shortcuts instead of components reading the setting?
Components own no state (ADR-013's "surfaces own no state" applies to their parts too). Reading a setting would tie `packages/ui` to the app's IPC. The host already knows the setting, and it passes either the live glyph string or `singleKeys`.

### Why keep `finishTime` and the numeric ring size?
The current Today uses both (`Today.tsx:188`, `:272`). Breaking them would force Today edits into a sub-project that owns no screen. C stops using them. Removing them later is a cleanup.

## Open questions
None. The owner answered both calls on 2026-11-10 and accepted the recommendations:
- Scope is P1's screens only; the planning, tracking and blocking components are built design-first at the start of their own phases.
- The icon set is adapted from Lucide's geometry (ISC licence), redrawn to the 20px grid and 1.5 stroke. Lucide's notice is added to #149. The owner approves the glyph sheet in the artifact preview before T7 merges.

## Implementation status
Updated by the PRs that implement this spec.
- [x] Plan: [`docs/plans/2026-11-10-p1-components.md`](../plans/2026-11-10-p1-components.md) (seven design-first tasks in series, as cut here)
- [x] T1 Real-engine harness, bundled fonts and the contrast check
- [x] T2 The small controls and the key table (VoiceOver: [ ] IconButton [ ] Tooltip [ ] Kbd)
- [x] T3 Timer faces and Start (VoiceOver: [ ] TimerRing [ ] TimerStrip [ ] StartButton)
- [x] T4 The preset popover (VoiceOver: [ ] PopoverMenu)
- [x] T5 Focus window and floater (VoiceOver: [ ] FullScreenFocus [ ] FloatingTimer)
- [x] T6 Commands, capture and the shortcut recorder (VoiceOver: [ ] CommandPalette [ ] CapturePad [ ] ShortcutRecorder)
- [x] T7 The icon set and the rail (VoiceOver: [ ] NavRail)
