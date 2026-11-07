# Orasenda design-system changes

Implemented the review's P0 and P1 component work and the inexpensive P2 refinements directly in `project/`. The bundle now exports 23 components: the original 10 plus 13 MVP components. Each new export has matching header registration, CSS, declarations, consumer documentation and a realistic preview.

The spec takes precedence over suggested implementation details. Meaningful marks use contrast-compliant `line-strong`; disabled labels remain fully readable; reduced motion removes all transitions; Gentle bypass reasons stay optional. The Google Fonts import remains exactly as requested, with local font bundling documented as an implementation-phase responsibility.

## Changes by file

### Shared files

| File | Changes |
| --- | --- |
| `project/tokens.json` | Warm light surfaces; muted sand Routine; stronger control/track/dot borders in both themes; primary/break hover and pressed tokens; critical tint/on-colour; overlay, selection and transparent RGBA tokens; three font declarations with OFL notes; timer-md/caption and zero-tracking tabular timer styles; spacing, dimensions, typography and z-index token lists; two-layer dark raised shadow; explicit usage grounds. Split the proposed `900x600` size into usable width/height tokens. Remove top-level name/version and duration note so every non-type family has the requested list shape. No motion family. |
| `project/components/bundle.js` | Update all 10 existing components; add the 13 components below and register each in line 1 and `window.Orasenda`; share a private native-dialog shell with unique IDs, safe Escape, initial focus and restoration; add asynchronous capture failure retention/duplicate-save guards, IME-safe command selection, and richer accessible task names. Retain one classic script with React through `window.React`; no imports or network calls. |
| `project/components/bundle.css` | Token-backed type and layout; full-contrast button states and broad focus-visible selector; meaningful borders/tracks/dots/hatch at 3:1+; remaining-ring geometry, pause/idle styling, shape-only glyph rotation fix; independent card selection/running state; short blocks; whole-row checkbox; all new component styles; native-dialog/backdrop rules; full-screen layout; reading-comfort inheritance; strict reduced-motion and modest forced-colour support. Retain the Google Fonts import. Keep the overflow side-strip hatch as the sole gradient. |
| `project/components/index.d.ts` | Match all 23 exports; add state, accessibility, callback and controlled-value props; retain compatible legacy habit strings and read-only card/block use; document progress and compact defaults. |
| `project/README.md` | Rewrite as imperative usage rules naming tokens. Add complete state matrix, hit targets, layout numbers, formatting, two-minute sequence, modal/capture/Escape rules, notification placement/lifetime, dark-theme rules, local-font requirement, reading-comfort behavior, class naming and keyboard integration guidance. |
| `project/components/Cover/preview.html` | Use soft-tint arcs on the ink slab; reduce the slab to 160×232 and resize/reposition its rings; remove redundant SVG radius CSS and obsolete art comment; use body-sm tagline, quieter name weight, and “One calm place for your time.” Add the Brand preview group. |

### Existing component documentation and previews

Every README below now opens with a consumer-provides / do / don't summary. Every preview below now includes explicitly token-valued light and dark examples, English document language, realistic content and, where relevant, working local callback feedback. Hover/pressed styles use actual pointer interaction, not fabricated state classes.

| File | Changes |
| --- | --- |
| `project/components/Button/README.md` | Document variants, loading-label responsibility, native/ARIA-disabled guards, and critical-only-in-dialog rule. |
| `project/components/Button/preview.html` | Primary, break, quiet, ghost, disabled and loading examples; invite hover/press/Tab inspection. |
| `project/components/ModeChip/README.md` | Explicit label-only contract, all modes including paused/idle, native-radio alternative. |
| `project/components/ModeChip/preview.html` | All seven labelled shape states in both themes. |
| `project/components/TimerRing/README.md` | Elapsed input / remaining arc contract, stroke sizing, spoken labels, clock, long-title clamp, pause and idle. |
| `project/components/TimerRing/preview.html` | Long task, warning, paused ring, and size-560 clock example; enlarged preview height. |
| `project/components/MenuBarTimer/README.md` | Compact-by-default menu contract, floating variant, mode shapes, spoken task context and idle behavior. |
| `project/components/MenuBarTimer/preview.html` | Focus, warning, break, paused, idle and floating timer. |
| `project/components/TaskCard/README.md` | Native keyboard activation, host editor responsibilities, selected versus running, neutral estimate metadata, absent estimate, capped decorative dots. |
| `project/components/TaskCard/preview.html` | Long active Frog, selected over-estimate task and unestimated Shallow task. |
| `project/components/TimeBlock/README.md` | Now bar/word, keyboard editor, 2px/min layout, compact threshold/minimum, overflow strip, selection and NowLine. |
| `project/components/TimeBlock/preview.html` | Active Deep block, NowLine, 15-minute Break and Routine blocks, and Overflow block. |
| `project/components/HabitDots/README.md` | Independent today/state API, dated names, legacy aliases, legend and kind restart copy. |
| `project/components/HabitDots/preview.html` | Today-and-done, rest/skipped/future states, legend and restart note. |
| `project/components/RoutineItem/README.md` | Controlled versus local preview state, 44px whole-row checkbox, optional/wellness guidance. |
| `project/components/RoutineItem/preview.html` | Controlled water toggle, completed item, optional practice and disclaimer. |
| `project/components/WellnessNote/README.md` | Note semantics, span/p choice, adjacent placement and evidence-conscious wording. |
| `project/components/WellnessNote/preview.html` | Default standalone note and limited-evidence custom note. |
| `project/components/IntentPrompt/README.md` | Native modal lifecycle, safe Escape/return, host-owned wait, optional local reason and honest continue path. |
| `project/components/IntentPrompt/preview.html` | Launchable modal with functioning return/wait/continue feedback; no actual blocking or data collection. |

### New component documentation and previews

Each pair below is new; its implementation is in the shared JS/CSS and its public API is in `index.d.ts`.

| README file | Preview file | Purpose/content |
| --- | --- | --- |
| `project/components/Dialog/README.md` | `project/components/Dialog/preview.html` | Safe-first general modal; review a delete-tracking-data confirmation without deleting anything. |
| `project/components/FullScreenFocus/README.md` | `project/components/FullScreenFocus/preview.html` | Ring/task/clock composition; Escape and ghost exit require confirmation while the session continues. |
| `project/components/Input/README.md` | `project/components/Input/preview.html` | Labelled native field; intent, neutral estimate error and disabled project. |
| `project/components/TextArea/README.md` | `project/components/TextArea/preview.html` | Labelled resizable notes field with associated helper/error text. |
| `project/components/CapturePad/README.md` | `project/components/CapturePad/preview.html` | Controlled thought and native interruption-source radios; asynchronous save-on-Escape. |
| `project/components/InlineNotice/README.md` | `project/components/InlineNotice/preview.html` | Polite two-minute, deep-hours and breakdown guidance with optional ghost action. |
| `project/components/Toast/README.md` | `project/components/Toast/preview.html` | Single bottom-centre saved-note message with explicit dismissal and no hidden expiry timer. |
| `project/components/NavRail/README.md` | `project/components/NavRail/preview.html` | Six icon-and-label destinations, current-page marker and local navigation feedback. |
| `project/components/KanbanColumn/README.md` | `project/components/KanbanColumn/preview.html` | Doing at limit, Today over limit, and empty Inbox; fluid task cards within a 280px well. |
| `project/components/CommandPalette/README.md` | `project/components/CommandPalette/preview.html` | Searchable combobox/listbox with arrow/Enter navigation, IME protection, close action and realistic commands. |
| `project/components/EmptyState/README.md` | `project/components/EmptyState/preview.html` | Kind empty Inbox with one quiet next step. |
| `project/components/StartButton/README.md` | `project/components/StartButton/preview.html` | Start focus / Just 2 minutes and realistic finish time. |
| `project/components/NowLine/README.md` | `project/components/NowLine/preview.html` | Labelled current-time rule and dot for the day calendar. |

### Handoff and verification files

| File | Changes |
| --- | --- |
| `02-codex-changes.md` | This change inventory, review disposition, evidence and coordinator checklist. |
| `verification/plan.md` | Task checklist and explicit native-browser verification limitation. |
| `verification/README.md` | Offline rerun instructions, dependency environment variables and test scope. |
| `verification/contrast.py` | Assert token schema/names/aliases/usages, CSS variable coverage and explicit text/UI contrast pairs in both themes. |
| `verification/contrast-results.json` | Machine-readable results for every tested foreground/ground pair. |
| `verification/dom.cjs` | 28 React/jsdom regression and bundle-contract checks. Native dialog geometry/containment are deliberately outside its claims. |
| `verification/browser.cjs` | Network-blocked Playwright harness for real hit targets, native modal focus/restore and representative preview screenshots; supplied for rerun because browser launch is blocked here. |
| `verification/preview.py` | Local-only preview server with live token injection and no remote font requests in the harness; binding a server is blocked in this environment. |

`SPEC.md`, `01-fable-review.md`, `contrast.py`, `proposed.py` and the pre-existing `project/design-system.json` were left unchanged. No `tokens.css` or `manifest.json` was created. No fonts were downloaded, dependencies installed, commits made, or external services called by the bundle.

## Review-item disposition

### P0

| Item | Status and reason |
| --- | --- |
| P0.1 Menu-bar semantics | Implemented: timer role, live-off spoken context, compact default, distinct warning/break/pause/idle shapes, and slimmer focus-ring geometry. |
| P0.2 Invisible marks | Implemented with a correction: use `line-strong`, not proposed `line`. The review's 1.4:1 line would violate the user's 3:1 requirement. Future/skipped/rest days also have distinct shapes; the hatch stays away from text. |
| P0.3 Button states | Implemented with a correction: explicit hover/pressed fills, disabled and busy guards, visible labels and critical variant. Reject 45% opacity because it undermines the full-contrast requirement. |
| P0.4 Estimate overrun | Implemented: focus-colour halo dots and “Est · Done · tracked” metadata; no amber or warning square. Exact counts remain readable even when dots are capped. |
| P0.5 Intent dialog | Implemented more completely than the proposed host-only trap: native modal shell owns background inertness, initial focus and restoration; useId links title/body; Escape returns to focus. Native WebKit behavior still needs verification. |
| P0.6 Routine checkbox | Implemented: controlled done/onChange, local default for previews, whole-row native checkbox button and 44px minimum. |
| P0.7 Focus selector | Implemented: links, fields, selects, summaries, buttons and explicit tab stops receive the shared outline. |

### P1

| Item | Status and reason |
| --- | --- |
| P1.1 Now versus focus | Implemented: “Now” plus inset bar, native actionable blocks and new NowLine. Keyboard outline stays independent. |
| P1.2 Compact blocks | Implemented with a 60px threshold instead of 44px: two normal text lines plus padding need more than 44px. Numeric and px-string heights work; non-pixel heights accept explicit compact. Keep a 24px floor instead of overlapping adjacent hit areas. |
| P1.3 Routine/amber | Implemented the muted taupe-sand values; amber remains the saturated warm warning family. |
| P1.4 Full-screen timer | Implemented adaptive stroke, clamped task, remaining arc, clock, spoken label, slow mode transition and FullScreenFocus composition. Timer digits scale down to fit. |
| P1.5 Habit states | Implemented object API, today-and-done, friendly labels, dated accessible names, legend, restartNote and legacy string support. |
| P1.6 Fonts | Partially implemented / deferred as explicitly requested: declare families/licences and local-bundling rule; retain Google Fonts import. Actual font packaging and removal of network loading from the shipped app are implementation-phase work. |
| P1.7 Reduced motion | Implemented by removing all movement **and all transitions**, with a static scale-1 breath. Reject retaining colour/opacity fades here; the stricter consistent rule is calmer and permitted by the spec. README matches behavior. |
| P1.8 Missing tokens | Implemented colours, timer-md/caption, 6px gap, control/hit/layout sizes and z-index families, plus explicit CSS typography tokens. Split window minimum into valid CSS dimensions. |
| P1.9 Missing MVP components | Implemented all eleven prioritised entries: FullScreenFocus; documented TwoMinuteWarning composite; Input/TextArea; CapturePad; InlineNotice/Toast; NavRail; KanbanColumn; CommandPalette; Dialog; EmptyState; StartButton. Added NowLine as well. Host-owned sound, scheduling, storage, native windows and actual drag/reschedule persistence remain integration responsibilities. |
| P1.10 Actionable cards/blocks | Implemented native buttons when callbacks exist, with Enter/Space support. Preserve static semantics without a callback rather than introduce dead tab stops. Separate selected from active and require the host editor to expose keyboard move/reschedule. |
| P1.11 Honest continue path | Implemented optional reason radios followed by explicit Continue. Reject executing a bypass immediately upon selecting a reason; radio navigation should not accidentally leave focus. Do not require a reason in Gentle mode because autonomy and friction-over-prohibition take precedence. |

### P2 and brand/cover additions

| Item | Status and reason |
| --- | --- |
| P2.1 Warm background | Implemented warm surfaces and stronger borders; reran both themes. |
| P2.2 Timer tracking | Implemented zero tracking and tabular numeric styles for all four timer scales. |
| P2.3 Destructive family | Implemented critical soft/on tokens and button variant, shown only within delete-data confirmation. |
| P2.4 ModeChip target | Implemented label-only contract. Use native radios with 44px labels instead of adding a redundant generic ChipToggle. |
| P2.5 Hard-coded dimensions | Implemented the useful spacing, panel/column/rail/control/icon/breath and typography tokens; cards follow their containers. Retain intrinsic SVG geometry, border thicknesses, percentage/container layout math and cover artwork coordinates as structural values, not brand tokens. |
| P2.6 Strike-through | Removed; completed routine text stays legible with filled check and ink-muted. |
| P2.7 Paused/idle | Implemented pause bars/word and frozen remaining arc; idle hides digits. Independent review caught and removed a dashed-style override that would have drawn a full ring while paused. |
| P2.8 Dark shadows | Implemented two layers and surface-step-first dark-theme guidance. |
| P2.9 Wellness semantics | Implemented role note and as="p". |
| P2.10 Preview coverage | Implemented light/dark examples, loading/disabled states, long titles, 15-minute blocks, no estimate and today-and-done. Actual hover/pressed/focus states are interactive. Visual rendering/zoom approval remains unverified because browser access was unavailable. |
| Brand book requests 1–11 | Implemented state matrix; dimensions/targets; warning sequence; dialogs; formatting; notifications; colour prohibitions; dark rules; font rule; class naming. Keep seconds in countdown-only surfaces, including menu/floating timers, since hiding them there would contradict the always-visible countdown examples. |
| Brand-book artifact registration | Rejected this edit: user explicitly prohibited writing `design-system.json`. The coordinator can register the README later if that constraint changes. |
| Cover issues 1–4 | Implemented soft arcs, smaller ink slab, token-sized sentence tagline and removal of redundant SVG radius CSS. |
| Additional input-method defect | Fixed CommandPalette so IME candidate Enter/arrow events, including the WebKit keyCode-229 case, cannot trigger host commands. |

## Contrast and verification results

`python3 verification/contrast.py` passes **121 pairs per theme (56 text, 65 UI), 242 total**. The test uses sRGB relative luminance, resolves colour aliases, checks button hover/pressed labels and meaningful borders on their stated grounds, and asserts thresholds rather than merely printing them.

| Theme | Minimum text ratio | Pair | Minimum UI ratio | Pair |
| --- | --- | --- | --- | --- |
| Light | **4.761:1** | ink-muted on critical-soft | **3.859:1** | line-strong on critical-soft |
| Dark | **5.531:1** | ink-muted on focus-soft / selection | **4.089:1** | line-strong on focus-soft / selection |

All text thresholds are at least 4.5:1, including small text. All tested meaningful marks/borders/icons/focus-ring grounds are at least 3:1. Decorative `line`, transparent `clear` and text-free `scrim` are not presented as compliant text or meaningful foregrounds. Cover soft arcs on ink are included. These results apply to the declared component grounds, not arbitrary consumer colour combinations or translucent native menu-bar materials.

Other completed checks:

- **28 React/jsdom checks passed** (cached React 19.2.7 and jsdom 30.1.3): warning/idle timer semantics; draining and paused geometry; controlled routines; loading/ARIA-disabled guards; complete actionable task names; absent estimates; compact blocks; today-and-done; unique field associations; dialog safe callback and restore contract; capture success/failure/duplicate-save behavior; command selection and IME safety; optional bypass; full-screen confirmation; navigation; export/header/type/doc/preview parity.
- **TypeScript declaration check passed** using `tsc --noEmit --strict --lib ES2020,DOM` with cached React types.
- **Required classic-script check passed** using `node -e 'new Function(require("fs").readFileSync("project/components/bundle.js", "utf8"))'`.
- Token shape, uniqueness, legal names, aliases, usage notes and every CSS variable reference passed. All 23 component preview scripts parsed.
- Independent source review identified paused-ring geometry and incomplete actionable-card metadata; both were corrected, and its IME finding was reproduced and fixed. No remaining P0/P1 finding was reported by that review.

The Playwright browser launch aborted under the sandbox. Local server binding returned `Operation not permitted`; the connected browser tool reported that its access host was unavailable. Consequently **no screenshot, native focus-trap, actual pointer hit-area, VoiceOver, visual clipping or WebKit claim is made**. jsdom explicitly shims showModal/close and does not validate native modality.

## Coordinator double-checks

1. Render all previews in the actual design-system host, especially the 560px timer, two-theme preview heights, compact calendar blocks, long task names, cover and 200% text scaling. Check bundled fonts separately from offline fallbacks.
2. Verify native WebKit modal support, Tab/Shift-Tab containment, background inertness, backdrop behavior, safe Escape, focus restoration, and VoiceOver naming. Keep one modal mounted/open and its trigger present. Check Japanese/Chinese composition on the target macOS build and run against the artifact host’s declared React 18 runtime; implementation uses React 18-compatible APIs, while the cached test runtime was React 19.2.7.
3. Confirm the token host accepts the required list-only root format, added typography/size families and font metadata. The previews include token-derived light/dark values so their comparison remains independent of the host theme; regenerate those values when colours change.
4. Wire host-owned state: freeze paused progress; schedule the two-minute cue once; honor reduced-motion/sound preferences; keep capture and bypass reasons local/deletable; return real save promises; handle native full-screen exit without stopping the session; route navigation/commands and expose keyboard move/reschedule in editors.
5. Respect changed defaults: rings drain, MenuBarTimer is compact, actionable cards require callbacks, RoutineItem becomes controlled with onChange, IntentPrompt is now a native modal, and no-estimate cards explicitly say so. Keep legacy habit strings only during migration.
6. Bundle licensed fonts inside the actual app and remove preview-only external font loading there. The supplied CSS deliberately retains its import under this task's constraint.
7. Validate forced colours, reduced motion, actual native menu-bar contrast against macOS materials, and that only one primary action is visible per application screen. The component catalog intentionally demonstrates multiple independent variants.
