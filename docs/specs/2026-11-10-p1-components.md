# P1 Components — Spec

- Status: draft
- Date: 2026-11-10
- Owner: Arnold Gandarillas Castillo
- Related: [ROADMAP, P1 sub-projects](../ROADMAP.md#p1-sub-projects) (amended here: this sub-project sits between B and C, unlettered), [issue #134](https://github.com/arkgast/orasenda/issues/134) (the P1 re-cut ruling, amended by a dated note in the ROADMAP), [#119](https://github.com/arkgast/orasenda/issues/119) (Start below the window; its Today test stays in C), [#149](https://github.com/arkgast/orasenda/issues/149) (third-party licence notices; the bundled fonts add to it), the Settings [spec](2026-11-09-settings.md) and [plan](../plans/2026-11-09-settings.md) (how B built its seven components design-first: #142, PR #152, PR #159), design-pass review [`design/reviews/04-redesign-pass.md`](../../design/reviews/04-redesign-pass.md) and its [changeset](../../design/reviews/04-redesign-pass/04-ds-changeset.md), [`design/system/README.md`](../../design/system/README.md), [`docs/conventions.md`](../conventions.md) ("Design-system changes are checked against their first consumer"), [CONTEXT.md](../../CONTEXT.md), the live design system https://claude.ai/artifact/Sk5N75HzRwY8v7dBxhsH73.

## TL;DR
- A new P1 sub-project, **Components**, between B and C. It builds, design-first, every design-system component that P1's remaining screens (C Today, D Focus views, E Session cadence, F Hotkeys and capture, G Data portability) need, before any of those screens is built. The owner asked for this on 2026-11-10: "all components ready, and implement the screens one by one, functionality + UI".
- **Scope is P1's screens only.** It covers 8 new components and the redesign props of 5 existing ones, plus a shared icon set and a layout rule function. Components for later phases wait for those phases: the planning components (TaskCard, KanbanColumn, RoutineItem, NowLine, IntentPrompt, `SessionSlot`, `Select`) and the tracking and blocking components (AppRow, RoleTag, AppPicker, BarRow, `Dialog emphasis="safe"`). Their screens have no behaviour yet, so nothing could check them against a consumer.
- **The real-engine checks move here from C.** These are the Playwright WebKit layout harness, the bundled fonts it measures with, and `verification/contrast.py` in `ci.sh`. A fluid ring, a strip and a 280×56 floater can't be checked in jsdom. C keeps the Today page cases, which include #119's failing test, and writes them on this harness.
- **The "first consumer" check, for components whose screens don't exist yet**, has three parts:
  1. a component test;
  2. a specimen in the WebKit harness in both themes, with reduced motion and keyboard runs;
  3. a review against the approved screen-group canvas and the README slot tables of the screen that will consume the component.

  The consumer screen and its sub-project are named for each component.
- **Size: six tasks, one PR each, in series.** Every design-first task republishes the same artifact and rewrites the same `bundle.js`, so no two can run at once.

## Change in a nutshell
When this sub-project closes, C's first screen task can write Today's paused controls from `@orasenda/ui` without a design-system round of its own:

```tsx
import { Icon, IconButton, StartButton, TimerRing, TimerStrip, timerLayout } from "@orasenda/ui";

const layout = timerLayout(box.width, box.height); // "ring" | "strip" | "stackedStrip", from the token thresholds
{layout === "ring"
  ? <TimerRing size="fluid" mode="paused" remaining="18:42" remainingLabel="18 minutes 42 seconds" progress={0.25} />
  : <TimerStrip mode="paused" remaining="18:42" remainingLabel="18 minutes 42 seconds" progress={0.25} />}
<IconButton size="round" label="Resume session" icon={<Icon name="play" />} shortcut={singleKeys ? "Space" : undefined} onClick={resume} />
<IconButton label="End session" icon={<Icon name="stop" />} shortcut="⌘." onClick={end} />
```

Each of these is in `window.Orasenda` and exported from `packages/ui/index.ts`. Each has a jsdom test in `packages/ui` and a specimen page that the harness renders in WebKit. That page is served by Vite from `packages/ui/specimens/` and loads the real Atkinson Hyperlegible fonts from files in the repo. The specimen is checked in light and dark, with reduced motion, by keyboard, and at the README's sizes. `just ci` runs the harness (macOS only) and `verification/contrast.py`. The design system's `index.d.ts` no longer marks any P1 component "Not implemented in bundle.js yet".

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
- The final icons don't exist: the README lists them as owed (`design/system/README.md`, Iconography, "Icon set").

B showed the cost of building components inside a screen sub-project. Its design-system task needed a second round, and then a follow-up PR, once the first page used it (`docs/conventions.md:89-102`). Doing that five more times, once in each of C–G, is the alternative this spec replaces.

## Goals / Success criteria
1. `window.Orasenda` (`bundle.js`) and `@orasenda/ui` (`packages/ui/index.ts`) export the new P1 components: `Icon`, `IconButton`, `Tooltip`, `Kbd`, `TimerStrip`, `PopoverMenu`, `FloatingTimer` and `ShortcutRecorder`. They also export the function `timerLayout`. The `exports_*` test in `packages/ui/index.test.tsx` lists all of them.
2. The redesign props of `TimerRing`, `StartButton`, `FullScreenFocus` and `CommandPalette` (with `Command.shortcut`) move onto their `*Props`. Their `*NextProps` interfaces are deleted. After the last task, `index.d.ts` declares exactly six `*NextProps`, all for later phases: `TaskCard`, `RoutineItem`, `IntentPrompt`, `Dialog`, `KanbanColumn` and `NowLine`.
3. Every component in the [inventory](#inventory) marked "to build" has the following. A task closes only when each holds in its PR:
   - (a) jsdom tests in `packages/ui`;
   - (b) a specimen in `packages/ui/specimens/` that renders every state the README names, plus `break` and `warning` for the timers, in `data-theme="light"` and `"dark"`;
   - (c) WebKit harness runs over that specimen with the cases listed under [Testing strategy](#testing-strategy): layout, keyboard, reduced motion and the accessibility tree;
   - (d) its colour pairs in `verification/contrast-pairs.json`, passing `verification/contrast.py` in both themes;
   - (e) a VoiceOver pass over the specimen in Safari, with what was spoken recorded in the PR.
4. `just ci` runs `verification/contrast.py` on every platform. On macOS it also runs the layout harness (`just layout`). A pair under its threshold fails the contrast check, and a specimen that overflows its box fails the harness. Each failure is shown by a test that seeds one.
5. The harness renders with the bundled fonts:
   - Atkinson Hyperlegible Next, Atkinson Hyperlegible Mono and Lexend, as `woff2` files under `packages/tokens/fonts/`, with their OFL licence texts;
   - `@font-face` rules generated into `tokens.css` from `type.fonts` in `tokens.json`;
   - each harness run asserts `document.fonts.check(...)` for every family, and that no request reaches a font CDN.
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
- **Device-only checks:** forced colours, Increase Contrast, VoiceOver in WKWebView, native menus. These stay with each screen's acceptance and the pre-beta device pass (#61).
- **Removing deprecated props.** `StartButton.finishTime` and `disabled`, and the numeric `TimerRing.size`, stay working. Dropping them is a later cleanup, not owed by C.
- **Windows layout checks.** The harness targets macOS's engine, so it is skipped elsewhere, as `just mobile` is.

## Users & permissions
One local user. Nothing here is a command or a capability. `bundle.js` runs in the webview with the page's existing rights.

| Caller | Can | Cannot |
|---|---|---|
| App code (C–G) | Import the components and `timerLayout`; pass in data, shortcut strings and the `singleKeys` flag | Expect a component to read a setting, the store or the clock |
| The artifact's preview | Render every component from `bundle.js` with the CDN fonts | Ship its font `@import` (`packages/ui/build.ts` strips it today) |

## Tenancy & localization
n/a for tenancy: one user, one device. Copy is English only, as in the rest of P1. Components receive every time string already formatted by Rust (ADR-011) and never compute time. Layout uses logical properties (`inset-inline`, `padding-inline`), as `bundle.css` already does. Measuring localised copy lengths and Lexend (reading comfort) stays owed, as in [the redesign record §7](../../design/reviews/04-redesign-pass.md).

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
  - One table in `bundle.js` maps a glyph string to its ARIA form (`⌘.` → `Meta+Period`) and to its spoken words (`⌃⌥F` → "Control-Option-F"). It is tested both ways.
- Any id that another element must reference can be set by a prop (`docs/conventions.md:102`).
- A component adds a live region only where its README names one (`docs/conventions.md:98-101`).

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
| **`Icon`** | to build (new) | One component, `name` from a closed union, 20px grid, 1.5 stroke, `aria-hidden`:<br>play, pause, stop (square), expand, collapse, window, menu, chevron, close, back, alert, info, and the six final rail icons | Every `IconButton`, Start, the rail (C, D) | T2 |
| **`IconButton`** | to build | README contract (`md`, `round`, built-in `Tooltip`, `aria-keyshortcuts` from `shortcut`, `aria-haspopup`) | Today Pause/Resume/End, Pages, Jump to section (C); Focus view, Leave full screen, floater (D) | T2 |
| **`Tooltip`** | to build | README contract (hover after `duration-quick`; on focus only after a keyboard event; Esc hides; stays while hovered; renders in the open dialog's top layer) | Preset summary "Change preset" (C), every `IconButton` | T2 |
| **`Kbd`** | to build | README contract (`spoken` required in text, hidden glyph) | The ⌃⌥F tip (C, F), the palette shortcut column (D), Settings › Keyboard list (F) | T2 |
| `NavRail` | built, contract gap | Roving tab stop (↑/↓, Return/Space); final rail icons from `Icon` | App shell on every page (C) | T2 |
| `TimerRing` | `TimerRingNextProps` (`index.d.ts:68`) | `size="fluid"`; the warning colour fade on `duration-slow` (today the arc and chip use `duration-calm`, `bundle.css:38,49`) | Today (C), Focus window (D), break and warning states (E) | T3 |
| **`TimerStrip`** | to build | README contract (digits ≥ `timer-md`, 10px bar, triangle, idle length) | Today strip and stacked strip (C), Focus window strip (D), states (E) | T3 |
| **`timerLayout(width, height)`** | to build (new function) | Returns `"ring" \| "strip" \| "stackedStrip"` from `layout-strip-height`, `layout-ring-min-height` and `layout-compact-width`. Pure; Today and the Focus window share it; called on resize only | Today (C), Focus window (D) | T3 |
| `StartButton` | `StartButtonNextProps` (`index.d.ts:86`) | Play glyph, `compactLabel`, `unavailable`, `singleKeys` for `aria-keyshortcuts`. `finishTime` and `disabled` still render but are marked deprecated | Today (C), Focus window idle (D) | T3 |
| **`PopoverMenu`** | to build | README contract (radio, checkbox and link rows, read-only state, Focus-window form with no Settings row, ↑/↓, Return/Space, Esc returns focus to the trigger) | Preset summary on Today (C) and in the Focus window (D) | T4 |
| `FullScreenFocus` | `FullScreenFocusNextProps` (`index.d.ts:78`) | Fluid ring or strip through `timerLayout`; Leave `IconButton` (Esc) with "Stay in full screen" as the initial focus; Pause/Resume and End; idle state; the `singleKeys` caption; "Session ended." | Focus window (D); its break and warning states (E's last task) | T5 |
| **`FloatingTimer`** | to build | README contract: running, paused, warning, idle, ended and deep, plus break for E, at 280×56, 280×64 and 360×96 | Floating timer panel (D); its states (E's last task) | T5 |
| `CommandPalette` | `CommandPaletteNextProps`, `CommandNext` (`index.d.ts:82-84`) | `Command.shortcut` as a right-aligned `Kbd`; `compact` with a Close `IconButton` | ⌘K (D) | T6 |
| `CapturePad` | built, copy gap | Redesign copy (description, the ⌘↩ helper, the line explaining the chosen kind); ⌘↩ saves | Capture panel (F) | T6 |
| **`ShortcutRecorder`** | to build | README contract (record, cancel, ⌫ off, restore default, conflict line, name composed with `aria-labelledby`, settable `id`) | Settings › Keyboard (F) | T6 |
| `SessionSlot`, `Select` | typed, no runtime | none | Planning page headers and pickers (P2–P3), AppPicker (P5) | later phase |
| `TaskCard`, `KanbanColumn`, `RoutineItem`, `NowLine`, `IntentPrompt`, `Dialog` `safe` (`*NextProps`) | redesign contract only | none | Planning (P2–P4), blocking (P6) | later phase |
| `AppRow`, `RoleTag`, `AppPicker`, `BarRow` | typed, no runtime | none | Apps and sites, Review usage (P5/P6) | later phase |

E and G need no new component. E's breaks and the two-minute warning are `mode="break"` and `mode="warning"` on `TimerRing`, `TimerStrip`, `FloatingTimer` and `FullScreenFocus`. Every specimen draws these states, because the canvases never drew the break arc ([redesign record §7](../../design/reviews/04-redesign-pass.md), timer surfaces). E's keep-going prompt and *Skip break* are compositions of `InlineNotice variant="row"` and `Button`, and E's spec draws them. G's rows and its one `critical` button use `SettingsRow` and `Dialog destructive`, which are built already.

### Contract gaps each task settles in the artifact first
Each gap below is a README or `index.d.ts` change. It is made in the artifact before any code, recorded in the task's PR, and then implemented:
- **T2.** `IconButton` and `Tooltip`:
  - the `shortcut` prop takes one glyph string. Its ARIA form and spoken form come from the shared key table;
  - the `id` prop passes through.
- **T3.** `StartButton` gains `singleKeys?: boolean` (default `true`). `TimerRing` warning: the arc and chip colour transition uses `duration-slow`.
- **T4.** `PopoverMenu`:
  - how it anchors to its trigger, with the trigger's `aria-expanded` and `aria-controls`;
  - whether it is rendered in the top layer or a positioned panel. This is decided by what WebKit on the minimum supported macOS can do, and the harness checks it.
- **T5.** `FullScreenFocus`:
  - gains `summary?: React.ReactNode` (the host's preset summary trigger, which opens its `PopoverMenu`), `singleKeys?: boolean` and `ended?: boolean`. The `onPause`, `onResume`, `onEnd` and `onStart` props stay.

  `FloatingTimer`:
  - gains `ended?: boolean`;
  - names where "Session ended." is announced once. Because the floater is a window of its own, its README must name a live region, or the host must announce it.
- **T6.** `CapturePad`:
  - the README says the pad announces "Saved to Inbox." once, but the pad closes on success, so it cannot announce from a closed dialog. The README is changed so that the host announces it. The pad adds no live region besides its existing error line.

  `CommandPalette`:
  - `compact` is a prop. The host sets it below `layout-compact-height`.

### Exports at the end
`window.Orasenda` and `packages/ui/index.ts` add `Icon`, `IconButton`, `Tooltip`, `Kbd`, `TimerStrip`, `timerLayout`, `PopoverMenu`, `FloatingTimer` and `ShortcutRecorder`. They also add the type `IconName`. The `declare global` block in `index.d.ts` lists them. `packages/ui/build.ts` and the `ui-css` staleness diff in `ci.sh` are unchanged.

### Harness and checks
- `verification/layout/`: `playwright.config.ts` with WebKit projects for `light`, `dark` and `light-reduced-motion`, and one `*.spec.ts` per component. The base URL is a Vite server for `packages/ui/specimens/`. `just layout` runs it. The `ci` recipe runs it after the ui tests on macOS and skips it elsewhere. C adds an `app` project for Today, using `mockIPC`, beside these.
- `verification/contrast.py`: Python 3, standard library only. It reads `design/system/tokens.json` and `verification/contrast-pairs.json` and prints each pair's ratios for both themes. It exits non-zero on any failure. `just contrast` runs it, and the `ci` recipe runs it before the tokens step. It is seeded with the pairs computed in [the changeset §9](../../design/reviews/04-redesign-pass/04-ds-changeset.md) and the `FloatingTimer` and `TimerStrip` README tables.
- New dev dependencies go through `baton:deps` in T1: `@playwright/test` (pinned, with its WebKit build) and `vite` for the specimen server in `packages/ui`.

## Behavior & edge cases
- **Three small visible changes in the current app:**
  - **Fonts (T1).** `tokens.css` starts loading the bundled families, so Today and Settings render in Atkinson Hyperlegible on Macs that don't have it installed. T1 re-runs B's real-engine Settings check: at 900×600 and 1440×900 in both themes, the page doesn't scroll and no line is clipped.
  - **The rail (T2).** It becomes one tab stop and takes the final icons.
  - **`TimerRing` warning fade (T3).** It changes from `duration-calm` to `duration-slow`. A only shows `focus`, `paused` and `idle`, so nobody sees the fade until E.
- **Compatibility.** Every change to an existing component adds to it. The current props keep their current output, so app code needs no change (Goal 6). If folding a `*NextProps` into its `*Props` breaks `pnpm --filter orasenda typecheck`, the task stops and asks for a ruling instead of editing app files, as B's T1 did (plan ruling 6).
- **Real-engine-only behaviour** is asserted in WebKit, not jsdom:
  - the fluid ring's diameter;
  - strip and floater overflow;
  - `:focus-visible` after programmatic focus (the Tooltip's keyboard-event flag);
  - top-layer rendering inside a `showModal()` dialog;
  - `container-type` sizing;
  - the reduced-motion computed `transition-duration: 0s`.
- **Fonts fail to load.** The harness fails. It never measures with a fallback font, because a fallback measurement is not evidence of the real layout.
- **A WebKit or Playwright download is missing offline.** `just layout` fails with the install command to run (`pnpm exec playwright install webkit`). It never silently skips on macOS.
- **The artifact and the repo disagree.** Under design-first, nothing in `design/system/` is edited by hand. A task whose refresh would differ from the republished artifact stops. Each PR links the artifact version it refreshed from (`design-system.json` `lastChange`).
- **A consumer spec finds a gap later.** If C–G's spec finds a contract this sub-project got wrong, that sub-project fixes it with a small design-first touch, recorded in its own spec, as B did for `InlineNotice` `actionVariant` (#134, comment 3). This sub-project is not reopened.

## Data & migrations
None: no store, schema or IPC change. `design/system/tokens.json` changes only in `type.fonts` (T1, artifact first), and `packages/tokens/tokens.css` is regenerated. Font files and their licences are added under `packages/tokens/fonts/`.

## Testing strategy
For every task:
- **Component tests** (jsdom, `packages/ui`, written first). These check roles and accessible names, which ids are linked, which props pass through, keyboard handlers, that no live region is added unless its README names one, and that every state renders its word or shape. The task's PR lists its test names.
- **WebKit harness** on the specimen, in every theme project:
  - every state renders inside its frame (`scrollWidth <= clientWidth`, `scrollHeight <= clientHeight`);
  - the focus ring is visible and not clipped by an ancestor;
  - the keyboard path from the README works with `page.keyboard` only;
  - `toMatchAriaSnapshot` matches the README's VoiceOver names;
  - under `light-reduced-motion`, every animated property has `transition-duration` 0.
- Per-task size cases, taken from the README's case list (`design/system/README.md`, "Pages never scroll; regions do"):
  - **T2:** a Tooltip at 40ch on two lines with its `Kbd` unbroken. A Tooltip inside an open `Dialog` is visible over it. `IconButton` hit boxes are ≥ 44×44 (`md`) and 52×52 (`round`).
  - **T3:** the fluid ring in containers from 160 to 1200px. Its diameter is clamped to [`timer-min-size`, `timer-full-size`], and its digits' computed font size is ≥ `timer-md`. `TimerStrip` at 360, 640 and 1440 wide. `timerLayout` is unit-tested at the README's window sizes (360×240, 360×360, 640×330, 640×480, 900×240, 900×600, 1440×900, 3440×400), and its constants are checked against `tokens.json`. `StartButton` at 399 and 400px of content shows "Start" and then "Start focus", and its name stays "Start focus".
  - **T4:** the menu fits at 360 wide. Esc returns focus to the trigger. The read-only form marks its radios `aria-disabled`.
  - **T5:** the `FullScreenFocus` specimen at 1280×720, 1920×1080 and a strip-shaped frame. The `FloatingTimer` at 280×56, 280×64 and 360×96 in each of running, paused, warning, idle, ended, deep (1:30:00) and break.
  - **T6:** the palette's compact form at 360×240. A long command's label and hint wrap without hiding the `Kbd`. `ShortcutRecorder` keeps a conflict line within `panel-width`.
- **Contrast:** `contrast.py` passes with the task's new pairs. A self-test seeds one failing pair and one floater combination where both fill and edge fail.
- **VoiceOver:** a pass in Safari over the specimen page, recording what was spoken for each state. WKWebView's own VoiceOver behaviour, including `aria-keyshortcuts` (e-onboarding-14), is owed to the consuming screen's acceptance.
- **Both themes by eye:** the PR attaches light and dark screenshots of the specimen from the harness.
- **Review:** the reviewer reads the approved screen-group canvas (timer surfaces, Settings or onboarding, [§5](../../design/reviews/04-redesign-pass.md)) and the README slot tables for the consumer named in the inventory, and checks each component against them. Because the consumer spec doesn't exist yet, the canvas and README stand in for it (`docs/conventions.md:95-97`).
- **No regressions:** `pnpm --filter orasenda test` and `typecheck`, `pnpm --filter @orasenda/ui test` and `./scripts/ci.sh` pass.

## Decisions
No ADR. Every choice here binds only this sub-project, or follows a rule the design system already states: the engine and the case list are in `design/system/README.md`, and the bundled fonts are in its Type section. These choices are explained in the FAQ.

`CONTEXT.md` gains **Specimen** and **First-consumer check**.

### Tasks (one PR each; target met: 6)
Every task is design-first and works in this order:
1. The orchestrator asks to "update the Orasenda design system". This reads the live artifact, settles the task's contract gaps, implements the components in its `bundle.js` and `bundle.css`, and republishes.
2. An implementer refreshes `design/system/` from that version byte for byte, regenerates `packages/ui` (`just ui-css`), exports the components and writes the tests and specimens.
3. The PR runs the checks listed under Testing strategy and links the artifact version.

The tasks run in series (see FAQ).

| # | Task | Builds | Consumers | Depends on |
|---|---|---|---|---|
| **T1** | Real-engine harness, bundled fonts and the contrast check | `verification/layout/`, the specimen server and a seed specimen (the existing `TimerRing` and `InlineNotice variant="row"` at 360 wide with "Open Settings"); fonts under `packages/tokens/fonts/` and `type.fonts` (artifact first); `verification/contrast.py` and its pairs; `just layout` and `just contrast` in `ci`; the README's "to be added as `verification/contrast.py`" changed to say it exists (artifact first) | All later tasks; C's Today cases | none |
| **T2** | Icons and the small controls | `Icon`, `IconButton`, `Tooltip`, `Kbd`, the key table, `NavRail` roving focus and final rail icons | C, D, F | T1 |
| **T3** | Timer faces and Start | `TimerRing` fluid and the warning fade, `TimerStrip`, `timerLayout`, `StartButton` redesign | C, D, E | T2 |
| **T4** | The preset popover | `PopoverMenu` | C, D | T2 (in series after T3) |
| **T5** | Focus window and floater | `FullScreenFocus` redesign, `FloatingTimer` | D, E | T3, T4 |
| **T6** | Commands, capture and the shortcut recorder | `CommandPalette` redesign, `CapturePad` copy, `ShortcutRecorder` | D, F | T2 (in series after T5) |

Every task closes with: both themes checked, the keyboard path, the accessibility-tree snapshot and a VoiceOver pass in Safari, reduced motion, contrast through `contrast.py`, and `./scripts/ci.sh` green. T6's PR also ticks this spec's Implementation status. The plan may split T2 if the icon drawing turns out to be its own round.

## FAQ
### Why build P1's components before its screens?
The owner asked for it on 2026-11-10: "ideally we should be having all components ready and implement the different screens one by one so we implement functionality + UI." It also removes a design-system round from each of C–G. In B, that round cost a second #152 review and a follow-up PR (#159).

### Why only P1's screens, not every component the design system declares? (controller's call)
`docs/conventions.md:89` says a design-system change is checked against its first consumer. The planning and blocking screens have no behaviour, no spec and no IPC yet. Their components could only be checked against a canvas, and they would sit unused for a whole phase or more. Those components are: `TaskCard`, `KanbanColumn`, `RoutineItem`, `NowLine`, `IntentPrompt` variants, `Dialog safe`, `SessionSlot`, `Select`, `AppRow`, `RoleTag`, `AppPicker` and `BarRow`. Each later phase builds its own, design-first, the way this sub-project does.

### What counts as the "first consumer" check when the consumer doesn't exist yet?
It has three parts. The component test and the WebKit specimen prove the README contract in a real engine, in both themes. The review against the approved canvas and the README slot tables of the named consumer stands in for the consumer spec's accessibility acceptance. If the screen's own spec later finds a gap, that sub-project fixes it with a small design-first touch, and this sub-project is not reopened.

### Why does the layout harness move here from C?
Three of this sub-project's components can't be checked without real layout: the fluid ring, the strip and the floater at 280×56. `container-type`, `:focus-visible` after programmatic focus and the top layer also behave differently in jsdom. If the harness stayed in C, T3 and T5 would ship with their main risk unverified, and C would find any problem after the fact. What moves is the harness, the fonts it needs and the contrast script. C keeps the Today cases, #119's failing test included, written on this harness as C's first task.

### Why Playwright WebKit and not the app's own WKWebView?
The README already names it as the layout test (`design/system/README.md`, Layout). It is close to WKWebView, it runs headless in CI on macOS, and it can emulate reduced motion and the colour scheme. VoiceOver and native menus still need the real app, and they stay with each screen's acceptance.

### Why bundle the fonts now?
A layout measured with a fallback font doesn't show how the real layout behaves. The README says the fonts ship inside the app and that the preview's CDN import must not ship. `type.fonts` is empty only because the files weren't in the repo yet (`design/system/tokens.json:40`). The OFL requires the licence text to travel with the fonts, and #149 (third-party notices, release precondition) gains them as an item.

### Why is the contrast check Python, given the repo has none?
The design system already names the file `verification/contrast.py` (`design/system/README.md`, Colour). It uses only the standard library, and `python3` is on every macOS machine with the command-line tools and on both CI runners. Renaming it would mean a design-first README change for no gain.

### Why six serial tasks rather than parallel waves?
Every task republishes the same artifact and rewrites `bundle.js`, `bundle.css`, `index.d.ts`, `design-system.json` and `packages/ui/index.ts`. The ownership rule (no two concurrent tasks edit one file) therefore forces a series. The next task's republish starts only after the previous PR merges. Splitting more finely would add republishes without adding parallelism.

### Why does the host pass shortcuts instead of components reading the setting?
Components own no state (ADR-013's "surfaces own no state" applies to their parts too). Reading a setting would tie `packages/ui` to the app's IPC. The host already knows the setting, and it passes either the live glyph string or `singleKeys`.

### Why keep `finishTime` and the numeric ring size?
The current Today uses both (`Today.tsx:188`, `:272`). Breaking them would force Today edits into a sub-project that owns no screen. C stops using them. Removing them later is a cleanup.

## Open questions
None blocking. The owner's taste calls are listed with the review message: the icon style and the start of C. Each has a recommended default, which the plan follows if no answer comes.

## Implementation status
Updated by the PRs that implement this spec.
- [ ] Plan
- [ ] T1 Real-engine harness, bundled fonts and the contrast check
- [ ] T2 Icons and the small controls
- [ ] T3 Timer faces and Start
- [ ] T4 The preset popover
- [ ] T5 Focus window and floater
- [ ] T6 Commands, capture and the shortcut recorder
