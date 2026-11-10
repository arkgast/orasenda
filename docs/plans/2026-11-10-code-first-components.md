# Code-first components — Implementation Plan

- Spec: [docs/specs/2026-11-10-code-first-components.md](../specs/2026-11-10-code-first-components.md) (approved 2026-11-10)
- Date: 2026-11-10
- Status: draft

## Overview
One foundation task (F), then one task per runtime component (C1–C32) in the spec's three waves, then the paused P1 Components tasks re-cut for TSX (T5 #172, T6 #173, T7 #174) and the close-out (#175). The owner fixed the shape (decision 12): one foundation PR, one PR per component, at most three component pipelines at once.

The shared files every component task edits (`src/index.ts`, `src/legacy.*`, the `exports_*` test) are laid out by F with **one line or one block per component**, so parallel tasks edit disjoint lines and a rebase is mechanical (see [File ownership](#file-ownership)).

Models (token budget, owner 2026-11-10): F is planned and reviewed by opus and implemented by sonnet. Component tasks are implemented by sonnet and reviewed by sonnet, except the ones marked **opus review** (layering, focus, timer layout). Docs-only follow-ups go to haiku. Fable is not used unless a ruling is critical.

## Contract
The public surface of `@orasenda/ui` (`src/index.ts`) and `window.Orasenda` stays the same names and props as `design/system/components/index.d.ts` at ee533d9. F owns `src/index.ts`'s structure; each component task changes only its own export lines. `src/types.ts` (type-only exports) is created complete by F and edited only by T5 and T6 (moving `FullScreenFocusNextProps`, `CommandPaletteNextProps`, `CommandNext` onto their components).

## Impact
- **Affected call paths / consumers:** every app import of `@orasenda/ui` (Today, Settings and its sections, App shell, overlay, DevPanel); app tests and `app.css` rules that select `os-*` classes; the WebKit specs in `verification/layout/`; `verification/contrast.py`; the live artifact.
- **Data and migrations:** no product data. Files move with `git mv` in F (spec, Data & migrations). Expand → migrate → contract: F adds the TSX pipeline beside the legacy bundle (expand), C1–C32 move one component each (migrate), #175 deletes `src/legacy.*` (contract).
- **Tests that must stay green:** `pnpm --filter @orasenda/ui test`, `pnpm --filter orasenda test` and `typecheck`, `just layout`, `just contrast`, `design-system-check`, the whole `./scripts/ci.sh` in every task.
- **Rollout and rollback:** every task is one squash commit; revert it and the legacy export it replaced comes back with it (the legacy code is deleted only when nothing uses it). The artifact is republished from `main` after the revert. v34 is kept under `design/reviews/05-v34/`.

## Dependency graph
```
F ──> wave 1: C1–C14 ──> wave 2: C15–C26 ──> wave 3: C27–C32 ──> T5 #172, T6 #173 ──> #175
                              └──> T7 #174 (after C8 NavRail and C20 StartButton) ──────┘
inside wave 2: C16 Dialog before C21 Tooltip and C22 PopoverMenu
```
Can start immediately after F, in parallel (at most three at once): any of C1–C14.

## File ownership
| File | Owner | Others may |
|---|---|---|
| `packages/ui/src/index.ts` | F (layout: one `export … from` line per public name, alphabetical) | Each Cn replaces only its own line(s) |
| `packages/ui/src/legacy.js` | F (one function block per component, delimited by `// <Name>` and `// end <Name>`; one export name per line) | Each Cn deletes its own block and export line once nothing legacy uses it, otherwise only its export line |
| `packages/ui/src/legacy.css`, `legacy.d.ts` | F (one block per component, same markers) | Each Cn deletes its own block |
| `packages/ui/src/index.test.ts` (`exports_*`) | F (one expected name per line) | No edits: the names don't change |
| `packages/ui/src/types.ts` | F | T5, T6 |
| `packages/ui/src/lib/layer.ts` | C16 Dialog | C21, C22, C29, C30 import it |
| `packages/ui/src/components/ui/glyphs.tsx` | F | T7 replaces it with `Icon` |
| `packages/tokens/tokens.json` | F | T7 only if an icon size token is needed |
| `packages/ui/src/guard.test.ts` | F | none |
| `apps/orasenda/src/styles/app.css`, app tests | — | Each Cn edits only rules and selectors for its own `os-*` classes |
| `verification/layout/<name>.spec.ts` | the component's Cn | — |
| `verification/contrast-pairs.json` | — | Each Cn edits only its own entries (`where` names the component) |

## Tasks

### F: Code-first foundation (#issue)
- Priority: 0
- Depends on: none
- Owns: `packages/ui/{package.json,tsconfig.json,vite.config.ts,components.json,design-system/**,src/index.ts,src/index.test.ts,src/types.ts,src/styles.css,src/lib/utils.ts,src/legacy.*,src/components/ui/glyphs.tsx,src/components/ui/*.md,src/guard.test.ts,src/design-system-check.test.ts}`, `packages/tokens/**`, `tools/biome/**`, `apps/orasenda/{package.json,vite.config.ts,src/main.tsx,src/App.tsx}`, `apps/orasenda/src-tauri/tauri.conf.json` (macOS minimum only), `justfile`, `.github/workflows/ci.yml`, `.gitignore`, `biome.json`, `pnpm-lock.yaml`, `verification/contrast.py`, `verification/contrast_test.py`, `verification/layout/playwright.config.ts`, `design/reviews/05-v34/**`; deletes `design/system/**` from git, `packages/ui/{build.ts,build.test.ts,index.ts,react-global.ts,components.css,components.d.ts}`
- Touches: `packages/ui/specimens/**` (moved under `src/components/ui/` as `<kebab>.specimen.tsx` by the owning Cn; F only repoints the Vite server so they keep working), CLAUDE.md (no change expected)
- Interfaces:
  - Produces: `cn(...inputs: ClassValue[]): string` (`src/lib/utils.ts`); `src/index.ts` exporting the 32 components, `describeShortcut`, `timerLayout` and the type-only exports; `@orasenda/ui/styles.css`; `packages/tokens/theme.css` (closed `@theme`, shadcn mapping, `--breakpoint-*`, `--container-*`, fluid utilities); `just design-system [--out <dir>]`; `just tokens` writing `tokens.css` and `theme.css`; glyph components `ModeShape`, `AlertGlyph`, `PlayGlyph` (`glyphs.tsx`, internal)
- Steps, in order:
  1. **Probe** (controller or opus, before the rest): publish a throwaway artifact with self-built `lib/react.js`, `lib/react-dom.js` and a one-component `bundle.js`, check `React.version === "19.3.1"` and that it renders, and that `"editing": "code"` is accepted. Stop and ask the owner if not.
  2. `baton:deps` for the spec's dependency list (latest stable on the day).
  3. Save v34 (`1794308783-85b3`, every file, `Artifact` read `paths`) to `design/reviews/05-v34/` (controller or opus).
  4. Moves (spec, Data & migrations), the theme and responsive tokens, the Vite outputs, the legacy files laid out per [File ownership](#file-ownership), the guards and lint, the CI steps, the app on Tailwind with lazy routes, macOS 15.8.2 and the build target (cite the Safari version).
  5. After merge: the first code-first publish (controller or opus).
- Acceptance:
  - [ ] `just design-system --out "$(mktemp -d)"` writes `components/bundle.js` whose line 1 is `/* @ds-bundle: {"format":4,"namespace":"Orasenda","components":[…32 names…]} */`, plus `bundle.css`, `index.d.ts`, `lib/react.js`, `lib/react-dom.js`, a README and `preview.html` per component, and `design-system.json` with the two `libraries` entries and `"editing": "code"`
  - [ ] `design-system-check` passes, and fails when a seeded export throws on render
  - [ ] `guard.test.ts` fails on a seeded `createElement` and on a seeded "!" in copy; the arbitrary-value lint fails on a seeded `w-[13px]` fixture
  - [ ] `git ls-files design/system` is empty and `design/system/` is in `.gitignore`
  - [ ] `tokens.json` has `breakpoint` (sm 640, md 768, lg 1024, xl 1280, 2xl 1536), `container` and `fluid` groups; a test checks every fluid token stays within its min and max from 390 to 1536 wide
  - [ ] `theme.css` starts with `--*: initial`; `bg-red-500` produces no CSS (test); `bg-primary` resolves to `--color-focus`
  - [ ] `contrast.py` reads `packages/tokens/tokens.json` and passes
  - [ ] `tauri.conf.json` `bundle.macOS.minimumSystemVersion` is `"15.8.2"`; the app's `build.target` names the matching Safari version, cited in the PR
  - [ ] Today and Settings load through `React.lazy`; `pnpm --filter orasenda test` and `typecheck` pass with no app test changed
  - [ ] every existing `packages/ui` test and WebKit spec passes unchanged against the legacy exports
  - [ ] `./scripts/ci.sh` passes
- Tests first: `design_system_bundle_header_lists_runtime_exports`, `design_system_bundle_loads_as_classic_script`, `design_system_renders_every_export`, `guard_rejects_create_element`, `guard_rejects_exclamation_in_copy`, `lint_rejects_arbitrary_tailwind_value`, `theme_is_closed`, `theme_maps_destructive_to_critical`, `fluid_tokens_stay_within_bounds`, `exports_match_previous_surface`
- Notes: review by opus. No component is rewritten here. `glyphs.tsx` holds the three inline glyphs from `bundle.js` as TSX. Preflight off, `[data-slot]` base layer (spec, Behavior). The Python step and Playwright cache in `ci.yml` stay.

### Component tasks C1–C32 (one issue each)
Every component task follows the spec's [per-component pipeline](../specs/2026-11-10-code-first-components.md#per-component-pipeline-one-pr-each):
- Priority: 1 (wave 1), 2 (wave 2), 3 (wave 3)
- Depends on: F and the tasks named in its row
- Owns: `packages/ui/src/components/ui/<kebab>.{tsx,md,test.tsx}` (and `.specimen.tsx` when marked), its old tests `packages/ui/<camel>.test.tsx` (moved), its old specimen `packages/ui/specimens/<Name>.tsx` (moved), `verification/layout/<camel>.spec.ts` (when it has one)
- Touches: its lines in `src/index.ts`, its blocks in `src/legacy.{js,css,d.ts}`, its entries in `verification/contrast-pairs.json`, app rules and test selectors for its `os-*` classes, `pnpm-lock.yaml` only if its row adds a dependency
- Interfaces:
  - Consumes: `cn` (F), the components in its row's "Depends on" as exported from their `.tsx`
  - Produces: `export function <Name>(props: <Name>Props): JSX.Element` and `export interface <Name>Props` from `<kebab>.tsx`, the same props as `legacy.d.ts`
- Acceptance (each task):
  - [ ] `<kebab>.tsx` exports `<Name>` and `<Name>Props`; `src/index.ts` exports it from there and not from `legacy.js`
  - [ ] its moved tests pass with only selectors changed (roles first, `data-slot` second, no `os-*`); any changed expectation is named in the PR
  - [ ] no size in the file is fixed except hit targets and 1px borders; layout changes use container variants (page components: viewport variants)
  - [ ] if it has a WebKit spec: every case passes, plus 390×844 and 1440×900; exact sizes are min/max ranges
  - [ ] Biome reports no error in its files; the arbitrary-value lint and guards pass
  - [ ] `design-system-check` renders it; `./scripts/ci.sh` passes
  - [ ] light and dark screenshots attached (specimen, or the app screen that uses it)
- Tests first: its existing tests, moved and failing against the empty TSX file; for components with none today, `renders_<state>_with_word_or_shape` per state its README names and `exposes_<role>_with_name`

| # | Component (`kebab`) | Wave | Depends on | Specimen | Adds dependency | Review | Notes |
|---|---|---|---|---|---|---|---|
| C1 | `Button` (`button`) | 1 | F | | | sonnet | `critical` variant is the only `destructive` use besides Dialog |
| C2 | `ModeChip` (`mode-chip`) | 1 | F | | | sonnet | uses `ModeShape` from `glyphs.tsx` |
| C3 | `Kbd` + `describeShortcut` (`kbd`, `src/lib/shortcuts.ts`) | 1 | F | yes | | sonnet | owns `src/lib/shortcuts.ts` and `describeShortcut.test.tsx`; keeps `strictShortcuts` |
| C4 | `Input` (`input`) | 1 | F | | | sonnet | owns the shared field; ids settable by prop |
| C5 | `HabitDots` (`habit-dots`) | 1 | F | | | sonnet | |
| C6 | `RoutineItem` (`routine-item`) | 1 | F | | | sonnet | also moves the CSS-only `Choice` classes to utilities |
| C7 | `WellnessNote` (`wellness-note`) | 1 | F | | | sonnet | |
| C8 | `NavRail` (`nav-rail`) | 1 | F | yes | | opus | viewport variants (app shell) |
| C9 | `NowLine` (`now-line`) | 1 | F | | | sonnet | |
| C10 | `PageFrame` (`page-frame`) | 1 | F | yes | | sonnet | viewport variants; the Settings font check sizes |
| C11 | `ScrollRegion` (`scroll-region`) | 1 | F | | | sonnet | "More below" stays |
| C12 | `SettingsIndex` (`settings-index`) | 1 | F | | | sonnet | |
| C13 | `MenuBarTimer` (`menu-bar-timer`) | 1 | F | yes | | sonnet | fits the 280×56 floater |
| C14 | `TimeBlock` (`time-block`) | 1 | F | | | sonnet | `minute-scale` stays exact (2px per minute) |
| C15 | `TextArea` (`text-area`) | 2 | C4 | | | sonnet | |
| C16 | `Dialog` (`dialog`) | 2 | C1 | yes | | opus | owns `src/lib/layer.ts`; removes the `HTMLDialogElement` shims from `test-setup.ts` |
| C17 | `EmptyState` (`empty-state`) | 2 | C1 | | | sonnet | |
| C18 | `InlineNotice` (`inline-notice`) | 2 | C1 | | | sonnet | status row exactly 44px stays (hit target) |
| C19 | `SettingsRow` (`settings-row`) | 2 | C1, C3 | | | sonnet | |
| C20 | `StartButton` (`start-button`) | 2 | C1, C3 | yes | | opus | `aria-keyshortcuts` from `singleKeys` |
| C21 | `Tooltip` (`tooltip`) | 2 | C3, C16 | yes | | opus | portals through `layer.ts`; Esc topmost only |
| C22 | `PopoverMenu` (`popover-menu`) | 2 | C3, C16 | yes | | opus | Radix DropdownMenu; Tab per README |
| C23 | `TimerRing` (`timer-ring`) | 2 | C2 | yes | | opus | absorbs `seed.spec.ts`; diameter a range in [`timer-min-size`, `timer-full-size`] |
| C24 | `TimerStrip` + `timerLayout` (`timer-strip`, `src/lib/timer-layout.ts`) | 2 | C2 | yes | | opus | owns `src/lib/timer-layout.ts` and `timerLayout.test.tsx` |
| C25 | `TaskCard` (`task-card`) | 2 | C2 | | | sonnet | |
| C26 | `KanbanColumn` (`kanban-column`) | 2 | C2 | | | sonnet | |
| C27 | `Toast` (`toast`) | 3 | C18 | | | sonnet | no sonner |
| C28 | `IntentPrompt` (`intent-prompt`) | 3 | C16 | | | sonnet | |
| C29 | `CapturePad` (`capture-pad`) | 3 | C15, C16 | yes | | sonnet | |
| C30 | `CommandPalette` (`command-palette`) | 3 | C4, C16 | yes | `cmdk` | opus | `baton:deps` for `cmdk` |
| C31 | `IconButton` (`icon-button`) | 3 | C21 | yes | | opus | |
| C32 | `FullScreenFocus` (`full-screen-focus`) | 3 | C16, C23 | yes | | opus | today's behaviour only; the redesign is T5 |

### T5: Focus window and floater, in TSX (#172, owns #183)
- Priority: 3. Depends on: C32, C31, C13, C24.
- Owns: `full-screen-focus.*`, new `floating-timer.{tsx,md,test.tsx,specimen.tsx}`, `verification/layout/{fullScreenFocus,floatingTimer}.spec.ts`; `src/types.ts` (removes `FullScreenFocusNextProps`). Touches `tooltip.tsx` and `popover-menu.tsx` (and their tests) for the two v34 fixes only: Tooltip `data-os-esc` and the PopoverMenu Tab fallback (C21 and C22 have merged by then).
- Input: `design/reviews/05-v34/` (FullScreenFocus, FloatingTimer, Tooltip `data-os-esc`, PopoverMenu Tab fallback). Acceptance and tests: the P1 Components T5 block, with responsive sizes per the code-first spec. The issue body is updated to this re-cut.

### T6: Commands, capture and the shortcut recorder, in TSX (#173)
- Priority: 3. Depends on: C30, C29, C3.
- Owns: `command-palette.*`, `capture-pad.*`, new `shortcut-recorder.*`; `src/types.ts` (removes `CommandPaletteNextProps`, `CommandNext`). Otherwise as the P1 Components T6 block.

### T7: The icon set and the rail, in TSX (#174)
- Priority: 3. Depends on: C8, C20. Can run beside wave 3.
- Owns: new `icon.{tsx,md,test.tsx,specimen.tsx}`, `glyphs.tsx` (deleted), `nav-rail.*`, `start-button.tsx` (glyph swap only). Uses the approved sheet https://claude.ai/artifact/4sLPYxKhoptC8wJXbU2hqt; `lucide-react` only through `baton:deps`; adds Lucide's notice to #149.

### #175: Close-out
- Depends on: T5, T6, T7. Deletes `src/legacy.*` if any block is left, decides Preflight (spec, Behavior), ticks both specs' Implementation status, collects the owner checklist.

## Coverage check
| Spec requirement | Task(s) |
|---|---|
| Goal 1 layout | F (lib, types, index), C1–C32 (component files), #175 (legacy deleted) |
| Goal 2 same public surface | F `exports_match_previous_surface`; every Cn |
| Goal 3 one `index.d.ts` | F (`ui-build`, `ui-types.test-d.tsx`) |
| Goal 4 TSX only | F `guard_rejects_create_element` |
| Goal 5 tokens only, responsive | F (theme, responsive tokens, lint); every Cn acceptance |
| Goal 6 artifact builds and loads | F probe, `design-system-check` |
| Goal 7 behaviour unchanged | every Cn (moved tests; phone and xl WebKit cases) |
| Goal 8 macOS 15.8.2 | F |
| Goal 9 docs | done in #185 |
| Goal 10 published | F step 5; every Cn after merge (controller) |
| Failure mode: a legacy component rendered inside a migrated one | F `design_system_renders_every_export`, rerun by every Cn |
| Failure mode: a Radix layer opened inside a legacy native `dialog[open]` | C21 `tooltip_inside_native_dialog_is_visible` |
| Failure mode: Esc with a tooltip over an open dialog | C21 `escape_closes_only_topmost_layer` |
| Failure mode: a stale generated `theme.css` | F `tokens` staleness step (seeded edit fails) |
| Failure mode: an export removed from `legacy.js` while a legacy function still calls it | F `design_system_renders_every_export`, rerun by every Cn |
