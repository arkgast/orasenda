# Code-first components — Spec

- Status: draft (awaiting owner approval)
- Date: 2026-11-10
- Owner: Arnold Gandarillas Castillo
- Related: [ADR-015](../DECISIONS.md#adr-015-code-first-design-system-on-shadcn-tailwind-and-radix) (code-first, the shadcn/Tailwind/Radix stack, macOS 15.8.2), the [P1 Components spec](2026-11-10-p1-components.md) (its engine table and design-first steps are superseded here; its contracts, cases and tasks T5–T7 stay), [CLAUDE.md](../../CLAUDE.md) "Keeping the design system in sync", [CONTEXT.md](../../CONTEXT.md), the live design system https://claude.ai/artifact/Sk5N75HzRwY8v7dBxhsH73 (v34, version `1794308783-85b3`), the approved glyph sheet https://claude.ai/artifact/4sLPYxKhoptC8wJXbU2hqt, issues [#172](https://github.com/arkgast/orasenda/issues/172) (T5, owns #183), [#173](https://github.com/arkgast/orasenda/issues/173) (T6), [#174](https://github.com/arkgast/orasenda/issues/174) (T7), [#175](https://github.com/arkgast/orasenda/issues/175) (close-out), [#61](https://github.com/arkgast/orasenda/issues/61) (pre-beta device pass), [#149](https://github.com/arkgast/orasenda/issues/149) (licence notices). Decisions approved by the owner on 2026-11-10.

## TL;DR
- **The code becomes the source of the design system.** Every runtime component moves from the hand-written `design/system/components/bundle.js` to one TSX file in `packages/ui/src/components/ui/`, built on shadcn, Tailwind v4 and Radix. The artifact is published from that code after each merge; nobody edits it by hand again.
- **One build tool.** Vite 8 builds the app, `@orasenda/ui`, the artifact's classic `bundle.js` and its React 19 library scripts. `design/system/` becomes a git-ignored build output (`just design-system`).
- **Tokens stay the one source of values.** `tokens.json` moves to `packages/tokens/`. A closed Tailwind `@theme` is generated from it, so a class can only name a token; arbitrary values fail lint.
- **The minimum macOS rises to 15.8.2.** The macOS 13 engine table in the P1 Components spec no longer applies.
- **Shape: one foundation PR, then one PR per component in three dependency waves, at most three at once.** Behaviour, WebKit sizes and contrast stay exactly as they are; only test selectors change. T5–T7 of P1 Components resume in TSX after the wave they depend on.

## Change in a nutshell
Today `Button` is hand-written JavaScript inside the artifact, copied into the repo byte for byte:

```js
// design/system/components/bundle.js (today; copied from the artifact)
function Button(p) {
  var rest = Object.assign({}, p);
  return h("button", Object.assign({ type: "button" }, rest, { className: cx("os-btn", …) }), …);
}
```

After this sub-project it is a TSX file in the repo, and the artifact is built from it:

```tsx
// packages/ui/src/components/ui/button.tsx
import { cva } from "class-variance-authority";
import type { ComponentProps, JSX } from "react";
import { cn } from "../../lib/utils";

const button = cva("inline-flex min-h-hit-min items-center gap-2 rounded-md px-4 …", {
  variants: { variant: { primary: "bg-primary text-primary-foreground", critical: "bg-destructive …" } },
});

export interface ButtonProps extends ComponentProps<"button"> { variant?: "primary" | "secondary" | "ghost" | "critical"; … }

export function Button({ variant, className, ...rest }: ButtonProps): JSX.Element {
  return <button type="button" data-slot="button" className={cn(button({ variant }), className)} {...rest} />;
}
```

```
packages/ui/src/components/ui/button.tsx       the component, its props inline
packages/ui/src/components/ui/button.md        its README (was design/system/components/Button/README.md)
packages/ui/src/components/ui/button.test.tsx  its jsdom tests
just design-system  →  design/system/  (git-ignored: bundle.js, bundle.css, index.d.ts, lib/react*.js, READMEs, previews)
publish after merge →  the live artifact, "editing": "code"
```

In general: for each of the 32 runtime components and the two functions (`describeShortcut`, `timerLayout`), the existing code and README are migrated into that layout, reviewed against the design, tested and swapped into the app. The public names and props in `@orasenda/ui` and `window.Orasenda` stay the same.

## Problem
The design system is edited by hand in the artifact and copied into `design/system/` (CLAUDE.md, "Keeping the design system in sync"). Its runtime is one 54 KB hand-written JavaScript file with no build, no types checked against the code and no lint (`biome.json` excludes `design/system`). Every P1 Components task republishes the same file, so no two can run at once (P1 Components FAQ, "Why seven serial tasks"). The app cannot tree-shake or type-check components against their real implementation: `packages/ui/index.ts` destructures `window.Orasenda` and re-exports a hand-written `index.d.ts`. With P1's screens about to be built one by one, the owner chose to make the code the source now (ADR-015), so screens and components can be built and reviewed in TSX like the rest of the app.

## Goals / Success criteria
1. **Layout.** Every runtime component in the [inventory](#inventory) is one `packages/ui/src/components/ui/<kebab>.tsx` with its props inline, a `<kebab>.md` README and a `<kebab>.test.tsx`. `src/lib/utils.ts` (`cn`), `src/lib/shortcuts.ts` (`describeShortcut` and the key table), `src/lib/timer-layout.ts` (`timerLayout`), `src/types.ts` (type-only exports) and `src/index.ts` (the public surface) exist. After the last wave, `src/legacy.js`, `src/legacy.css` and `src/legacy.d.ts` are deleted.
2. **Same public surface.** `src/index.ts` exports the same 32 components, `describeShortcut` and `timerLayout`, with the same prop names and meanings as `design/system/components/index.d.ts` today. The `*NextProps` interfaces and the contract-only components (`Select`, `SessionSlot`, `AppRow`, `RoleTag`, `AppPicker`, `BarRow`) are type-only exports. The `exports_*` test in `packages/ui` lists them all.
3. **One `index.d.ts`.** `tsc` 7 with `isolatedDeclarations` and `rolldown-plugin-dts` produce one `index.d.ts` for `@orasenda/ui`, which the artifact ships as `components/index.d.ts`. The app typechecks against the TypeScript source (`exports` points at `src/index.ts`); `ui-build` also compiles `apps/orasenda/src/ui-types.test-d.tsx` against the built `index.d.ts`, so the shipped types are checked too.
4. **TSX only.** No source file under `packages/ui/src` calls `createElement` (guard test). JSX uses the automatic runtime.
5. **Tokens only, responsive by default.** Every class names a token through the generated closed `@theme`; a seeded arbitrary value (`w-[13px]`, `bg-(--x)`, `text-[#fff]`) fails `just ci`. No component has one fixed size for every screen (owner, 2026-11-10):
   - **Breakpoints:** `tokens.json` gains a `breakpoint` group with Tailwind's steps (`sm` 640, `md` 768, `lg` 1024, `xl` 1280, `2xl` 1536; below `sm` is a phone) and a `container` group with Tailwind's container sizes (`@3xs` … `@7xl`). The closed theme emits them as `--breakpoint-*` and `--container-*`, so `md:`, `lg:`, `@md:` work as in stock Tailwind.
   - **Components respond to their container, pages to the viewport.** A component uses container variants (`@container`, `@sm:`, `@lg:`), because the same component sits in a 280px floater, a sidebar and a full-screen window. Page layout (the app shell, `PageFrame`, Settings) uses viewport variants (`md:`, `lg:`, `xl:`).
   - **Fluid between steps.** Type, spacing, gaps and the timer scale smoothly with `clamp(<min token>, <fluid token>, <max token>)`, where the fluid tokens (a `fluid` group, preferred terms in `cqi`) are added in the foundation. Steps change layout; fluid tokens change size.
   - **Fixed on purpose:** only hit targets (`hit-min`, `hit-floor`, `round` 52×52 from `design/system/README.md` "Layout and hit targets") and 1px borders.
6. **The artifact builds and loads.** `just design-system` writes `design/system/` (git-ignored). Its `components/bundle.js` is one classic IIFE whose line 1 is the `@ds-bundle` header, which reads `window.React` and `window.ReactDOM` and assigns `window.Orasenda` with `Object.assign(window.Orasenda || {}, …)`. CI builds it into a temp dir and checks that it loads as a classic script after `components/lib/react.js` and `react-dom.js` and renders every runtime export.
7. **Behaviour unchanged; sizes may respond.** Behaviour, copy, colour and contrast stay the same, and jsdom tests keep their expectations with only selectors changed. Sizes may now differ by screen: the WebKit specs keep every fit, hit-target, focus, keyboard, reduced-motion and accessibility-tree check at every size they test, and gain a phone case (390×844) and an `xl` case (1440×900, already in the README's list). An exact-size expectation (a diameter, a font size) becomes a range from its min and max tokens. A PR that changes an expectation names it and why.
8. **macOS 15.8.2.** `tauri.conf.json` `bundle.macOS.minimumSystemVersion` is `15.8.2`, and the Vite build target is the Safari engine that macOS 15.8.2 ships (cited in the foundation PR).
9. **Docs.** CLAUDE.md, CONTEXT.md, the P1 Components spec and ADR-015 say code-first (done in this spec's PR).
10. **Published.** After every merge to `main` that changes `packages/ui` or `packages/tokens`, the controller (or an opus agent) runs `just design-system` from `main` and publishes the result to the live artifact. The first code-first publish happens only after v34 is saved under `design/reviews/`.

## Non-goals
- **New components or redesign work.** `FloatingTimer`, `ShortcutRecorder`, `Icon` and the redesign props of `FullScreenFocus` and `CommandPalette` stay with T5–T7 (#172–#174), which resume in TSX after their wave. This spec only migrates what `bundle.js` implements today.
- **Changing any behaviour, copy or colour.** Sizes respond to the screen (goal 5); any other visible difference is a bug unless the PR names it (goal 7).
- **Migrating the app's own CSS to Tailwind.** `apps/orasenda/src/styles/app.css` keeps its token variables. Only the rules and test selectors that target a migrated component's `os-*` classes change, in that component's PR.
- **Windows and mobile build targets.** The macOS bump touches only `bundle.macOS`; iOS stays 16.0.
- **Reviewing generated output.** Nobody diffs or reviews `design/system/`, `index.d.ts`, `bundle.js` or the theme CSS; reviews read the TSX and the generators.
- **Committed screenshot baselines** (as in P1 Components).

## Users & permissions
One local user; nothing here is a runtime permission. The roles are contributors:

| Role | Can | Cannot |
|---|---|---|
| Implementer (sonnet) | Change `packages/ui`, `packages/tokens`, app selectors, tests; run `just design-system` locally | Publish the artifact; edit `design/system/` (it is generated) |
| Controller or opus reviewer | Everything above, plus publish from `main` after a merge, with `"editing": "code"` | Publish from a branch, or publish an unmerged change |
| The live artifact | Show what `main` last published | Be edited by hand (ADR-015) |

## Tenancy & localization
n/a for tenancy: one user, one device. Copy stays English and unchanged. Components still receive every time string formatted by Rust (ADR-011). Logical properties stay logical: Tailwind's `ps-*`, `pe-*`, `ms-*`, `inset-s-*` replace `padding-inline-start` and friends one for one.

## Domain model
No product entities. The units are build artifacts and migration steps.

- **Component file:** `<kebab>.tsx`, exporting one public component (PascalCase, as in the inventory) and its `<Name>Props`. Internal helpers it alone uses stay in the file. shadcn's generated part exports (`DialogContent`, `TooltipTrigger`, …) are file-internal unless a README names them as public.
- **README:** `<kebab>.md`, the component's contract (was `design/system/components/<Name>/README.md`). It is source; the build copies it to `components/<Name>/README.md`.
- **Specimen:** `<kebab>.specimen.tsx`, only for the [14 listed components](#specimens) (16 after T5 and T6). One file is both the artifact's `components/<Name>/preview.html` (compiled by Vite) and the page the WebKit specs and `just specimens` load. Replaces `packages/ui/specimens/<Name>.tsx` and the specimen entry in CONTEXT.md.
- **Static card:** the generated `preview.html` for a component with no specimen: its name, the first paragraph of its README and its props table, in both themes.
- **Legacy bundle:** `src/legacy.js` (today's `bundle.js` as an ES module that exports its functions instead of assigning `window.Orasenda`), `src/legacy.css` (today's `bundle.css`) and `src/legacy.d.ts` (today's `index.d.ts`). Temporary; they keep `bundle.js` and `index.d.ts` complete while the waves run.
- **Wave:** a set of components whose component dependencies are all migrated already. A component's PR may start once every component it depends on has merged.
- **Theme CSS:** `packages/tokens/theme.css`, generated: a closed `@theme` (`--*: initial`, then one entry per token) and the shadcn semantic variables mapped to Orasenda tokens.

Invariants:
- `index.ts` exports each public name exactly once, from either a component file or `legacy.js`, never both. A migrated component's name leaves `legacy.js`'s export list in the same PR.
- A legacy component that still uses a migrated one keeps using its own legacy copy until it migrates; wave order makes this short. A legacy function is deleted from `legacy.js` (and its rules from `legacy.css`) only when no remaining legacy function or rule uses it.
- No new component, prop, token or copy enters through a migration PR. A change to a contract goes through its README in the same PR and is named in the description.
- The generated files (`theme.css`, `tokens.css`, `index.d.ts`, everything in `design/system/`) are never edited by hand.

## Interfaces

### Package layout
```
packages/tokens/
  tokens.json            the token source (moved from design/system/tokens.json)
  build.ts               → tokens.css (as today) and theme.css (new)
  tokens.css, theme.css  generated, committed, checked for staleness in ci
  fonts/                 unchanged
packages/ui/
  components.json        shadcn config (style, aliases, css path; no CDN, no icon library until T7)
  src/index.ts           the public surface
  src/types.ts           *NextProps, contract-only components, shared unions (Mode, NavPage, …)
  src/styles.css         Tailwind's theme and utilities layers (no Preflight), a base layer scoped to [data-slot], theme.css, legacy.css, tw-animate-css
  src/lib/utils.ts       cn() = twMerge(clsx(…)), twMerge configured with the closed theme's scales
  src/lib/shortcuts.ts   describeShortcut and the key table
  src/lib/timer-layout.ts timerLayout and its token constants
  src/lib/layer.ts       the container for portals while legacy and Radix layers coexist (see Behavior)
  src/components/ui/<kebab>.tsx | .md | .test.tsx | .specimen.tsx (listed ones only)
  src/components/ui/glyphs.tsx  the inline glyphs today's bundle shares (mode shapes, alert, play); internal, replaced by Icon in T7
  src/legacy.js, legacy.css, legacy.d.ts   temporary (see Domain model)
  design-system/         the artifact's own sources: README.md (was design/system/README.md), design-system.json template, Cover
  vite.config.ts         library build, bundle.js build, lib/react*.js build, specimen pages
```
The app imports `@orasenda/ui` from source (`exports["."]` → `./src/index.ts`, and `./styles.css`), so Vite compiles it with the app and HMR works. The library build is for the artifact and for `index.d.ts`.

### Builds (Vite 8, one config per output, all in `packages/ui/vite.config.ts` unless noted)
| Output | How | Notes |
|---|---|---|
| App | `apps/orasenda/vite.config.ts` with `@tailwindcss/vite` | Pages load with `React.lazy` routes (Today, Settings, Placeholder pages); the overlay entry stays separate |
| `@orasenda/ui` library | library mode, ES, `react`, `react-dom`, `radix-ui` external | `rolldown-plugin-dts` emits one `index.d.ts` from `isolatedDeclarations` |
| `components/bundle.js` | library mode, `iife`, `react` → `window.React`, `react-dom` → `window.ReactDOM`; `react/jsx-runtime` bundled in | Line 1 is the `@ds-bundle` header (format 4, namespace, runtime component list generated from `index.ts`); minified; footer `window.Orasenda = Object.assign(window.Orasenda \|\| {}, {…})` |
| `components/bundle.css` | Tailwind build of `src/styles.css` | Includes `tokens.css` and the font faces; no CDN `@import` |
| `components/lib/react.js`, `react-dom.js` | IIFE builds of React 19.3.1 and react-dom 19.3.1 (`client` entry) | Assign `window.React` and `window.ReactDOM` (with `createRoot`) |
| `components/<Name>/preview.html` | specimen page compiled by Vite, or a static card | Loads only `lib/*.js`, `bundle.js`, `bundle.css` |

`design-system.json` gains, from the build:
```json
"libraries": [
  { "name": "react", "version": "19.3.1", "global": "React", "file": "components/lib/react.js" },
  { "name": "react-dom", "version": "19.3.1", "global": "ReactDOM", "file": "components/lib/react-dom.js" }
],
"editing": "code"
```
`lastChange` is written by the build from the `main` commit it was built from (`via: "just design-system"`, the short SHA and the merged PR's title).

### Theme mapping
The closed `@theme` lists only Orasenda tokens, so `bg-red-500`, `p-3.5` or `text-[13px]` do not exist. Scales are named after tokens: `bg-surface-raised`, `text-ink-muted`, `p-4`, `p-1-5` (one `--spacing-*` entry per `space-*` token step), `rounded-md`, `shadow-raised`, `duration-calm`, `min-h-hit-min`, `z-popover`, `font-sans`/`font-mono`/`font-alt` from `type.families`, and one `text-*` utility per type style.

shadcn's semantic variables point at Orasenda tokens in both themes:

| shadcn | Orasenda | shadcn | Orasenda |
|---|---|---|---|
| `background` | `surface` | `muted` | `surface-sunken` |
| `foreground` | `ink` | `muted-foreground` | `ink-muted` |
| `card`, `popover` | `surface-raised` | `accent` | `focus-soft` |
| `card-foreground`, `popover-foreground`, `accent-foreground`, `secondary-foreground` | `ink` | `destructive` | `critical` |
| `primary` | `focus` | `destructive-foreground` | `on-critical` |
| `primary-foreground` | `on-focus` | `border` | `line` |
| `secondary` | `surface-sunken` | `input` | `line-strong` |
| `ring` | `focus-ring` | `sidebar*` | `surface` / `ink` / `line` (the rail) |

The `chart-*` variables are omitted. Orasenda-only colours (`break`, `routine`, `amber`, `selection`, `scrim`, …) are utilities under their own names. `destructive` is `critical`, so the copy and colour guard checks both names.

### Lint and guards
- **Arbitrary values:** a Biome GritQL plugin under `tools/biome/` rejects any class string token with an arbitrary value or variable (`[` … `]`, `(` … `)`) in `className`, `cn()`, `cva()` and `cx` calls in `.tsx` files. If GritQL cannot express it, a `just tailwind-strict` scan of the same strings does it; either way it runs in the lint step and is shown failing on a seeded fixture.
- **No `createElement`:** `packages/ui/guard.test.ts` fails on `createElement` (any receiver, and `import { createElement }`) in `src/**/*.{ts,tsx}`.
- **Copy and colour guard:** the existing guard rescans the TSX string and JSX text literals (not `bundle.js`) for "!" in user-facing copy, emoji, and `critical`/`destructive` outside `Dialog` destructive and `Button variant="critical"`.
- **Biome:** `packages/ui/src` is linted like the app; `a11y` errors block (conventions). Each component's PR fixes the hits in its own file.

### CI additions (all in the `ci` recipe; fastest first, per conventions)
1. `tokens`: `tokens.css` and `theme.css` are up to date (`git diff --exit-code`).
2. `ui-build`: the library build and `index.d.ts`, then `tsc` over `apps/orasenda/src/ui-types.test-d.tsx` with `@orasenda/ui` mapped to the built `index.d.ts`.
3. `design-system-check`: `just design-system --out "$(mktemp -d)"`, then a Node test loads `lib/react.js`, `lib/react-dom.js` and `bundle.js` as classic scripts in jsdom (`runScripts: "dangerously"`, no module loader), asserts line 1 parses as the `@ds-bundle` header listing exactly the runtime exports, and renders each export with the minimal props from its README without an error or a console error.
4. The existing `ui-css` staleness step and `components.css`/`components.d.ts` are removed in the foundation PR (their job moves to steps 1–3).

### Inventory
Dependencies are other components and shared helpers each one calls in today's `bundle.js`. Wave 1 depends on nothing but the foundation (`cn`, `glyphs.tsx`, the theme). "shadcn base" is the `shadcn add` item the file starts from; "—" means plain TSX on Tailwind. "Specimen" marks the 14 with a WebKit page.

| Component | Depends on | shadcn base (Radix) | Wave | Specimen | First consumer |
|---|---|---|---|---|---|
| `Button` | — | button | 1 | | every screen |
| `ModeChip` | glyphs (mode shape) | badge | 1 | | Today (C) |
| `Kbd` + `describeShortcut` (`lib/shortcuts.ts`) | — | kbd | 1 | yes | C, D, F |
| `Input` (owns the shared field) | glyphs (alert) | input, label | 1 | | Today, Settings |
| `HabitDots` | — | — | 1 | | P2–P4 |
| `RoutineItem` | — | checkbox | 1 | | P2–P4 |
| `WellnessNote` | — | — | 1 | | P2–P4 |
| `NavRail` | — | — (roving focus by hand, as its README says) | 1 | yes | app shell |
| `NowLine` | — | — | 1 | | Calendar (P2) |
| `PageFrame` | — | — | 1 | yes | Settings |
| `ScrollRegion` | — | scroll-area | 1 | | Settings |
| `SettingsIndex` | glyphs (alert) | — | 1 | | Settings |
| `MenuBarTimer` | glyphs (mode shape) | — | 1 | yes | floater (D) |
| `TimeBlock` | glyphs (mode shape) | — | 1 | | Calendar (P2) |
| `TextArea` | `Input` (field) | textarea | 2 | | capture (F) |
| `Dialog` (owns the shared modal shell) | `Button` | dialog, alert-dialog (destructive) | 2 | yes | D, G |
| `EmptyState` | `Button` | — | 2 | | Settings |
| `InlineNotice` (owns the status row) | `Button`, glyphs | alert | 2 | | Today, Settings |
| `SettingsRow` | `Button`, `Kbd` | — | 2 | | Settings |
| `StartButton` | `Button`, `describeShortcut`, glyphs (play) | — | 2 | yes | Today (C) |
| `Tooltip` | `Kbd`, `Dialog` (layering) | tooltip | 2 | yes | every `IconButton` |
| `PopoverMenu` | `Kbd`, `Dialog` (layering) | dropdown-menu | 2 | yes | preset summary (C, D) |
| `TimerRing` | `ModeChip` | — | 2 | yes | Today (C) |
| `TimerStrip` + `timerLayout` (`lib/timer-layout.ts`) | `ModeChip` | — | 2 | yes | Today (C) |
| `TaskCard` | `ModeChip` | card | 2 | | P2 |
| `KanbanColumn` | `ModeChip` | — | 2 | | P2 |
| `Toast` | `InlineNotice`, `Button` | — (no sonner: the README's Toast is a static row) | 3 | | Settings |
| `IntentPrompt` | `Dialog`, `Button` | — | 3 | | P2–P4 |
| `CapturePad` | `Dialog`, `TextArea`, `Button` | — | 3 | yes | capture (F) |
| `CommandPalette` | `Dialog`, `Input`, `Button` | command (cmdk) | 3 | yes | ⌘K (D) |
| `IconButton` | `Tooltip`, `describeShortcut` | button | 3 | yes | C, D |
| `FullScreenFocus` | `Dialog`, `TimerRing`, `Button` | — | 3 | yes | Focus window (D) |

Type-only exports in `src/types.ts`: every `*NextProps` today's `index.d.ts` declares (`TaskCard`, `RoutineItem`, `IntentPrompt`, `Dialog`, `KanbanColumn`, `NowLine`, and `FullScreenFocus`, `CommandPalette` and `CommandNext` until T5 and T6 move them onto their components), plus `SelectProps`, `SessionSlotProps`, `AppRowProps`, `RoleTagProps`, `AppPickerProps`, `BarRowProps` and their components as `declare` types. `Choice` stays CSS-only (classes in `legacy.css` move to `src/styles.css` utilities in the `RoutineItem` PR, its only runtime neighbour). `Cover` moves to `design-system/` (preview only).

After the waves: **T5** (#172: `FullScreenFocus` redesign, `FloatingTimer` from v34, owns #183) resumes after wave 3; **T6** (#173: `CommandPalette` redesign, `CapturePad` copy, `ShortcutRecorder`) after wave 3; **T7** (#174: `Icon`, the approved glyph sheet, `NavRail` roving and rail icons, `StartButton` on `Icon`) after wave 2 (it needs `NavRail` and `StartButton`); **#175** closes out after T5–T7 and deletes the legacy files if a wave left any.

### Specimens
Chosen because a WebKit spec measures them now or will in T5–T7 (P1 Components Testing strategy):
- the seven with a layout spec today: `Kbd`, `IconButton`, `Tooltip`, `StartButton`, `TimerRing`, `TimerStrip`, `PopoverMenu` (the seed page, `seed.spec.ts`, folds into `TimerRing`'s specimen);
- seven more from the migration: `NavRail` (T7 roving focus), `PageFrame` (the Settings font check at 900×600 and 1440×900), `MenuBarTimer` (inside the floater), `Dialog` (layers over it), `CapturePad` and `CommandPalette` (T6 cases), `FullScreenFocus` (T5 cases);
- then `FloatingTimer` (T5) and `ShortcutRecorder` (T6): 16 by #175.

Everything else gets a static card.

### Per-component pipeline (one PR each)
1. **Migrate.** Start from `shadcn add <base>` if the inventory names one, then rewrite it to the README contract and today's `bundle.js` behaviour; move the README to `<kebab>.md`, the props from `legacy.d.ts` inline, the tests from `packages/ui/<name>.test.tsx` to `<kebab>.test.tsx` (roles first, `data-slot` second), and the specimen if listed. Make it responsive (goal 5): container variants for layout changes, fluid tokens for sizes, fixed only for hit targets and borders. Add the phone and `xl` cases to its WebKit spec if it has one. Remove the name from `legacy.js`'s exports (and the function and CSS if nothing legacy still uses them).
2. **Review against the design, test, fix.** Opus reviews against the README, the approved canvases named in the P1 Components spec, and the first consumer's acceptance (conventions, "first consumer"). One fix round.
3. **Swap into the app.** Update app selectors and `app.css` rules that target the component's `os-*` classes; run `./scripts/ci.sh` (every test, the WebKit specs and contrast).
4. **After merge:** the controller publishes from `main`.

### Foundation PR
One PR before any component. **First step, before anything else:** prove that the artifact host honours `libraries[].file` (self-built React 19 instead of the host's React 18) and `"editing": "code"`. Publish a throwaway artifact with `components/lib/react.js`, `react-dom.js` and a one-component `bundle.js`, open it, and check `React.version` is 19.3.1 and the component renders. If the host ignores either field, stop and ask the owner before building the rest.
- Tailwind v4 (`@tailwindcss/vite`), `shadcn init` (`components.json`, `cn`), `tw-animate-css`, `class-variance-authority`, `clsx`, `tailwind-merge`, `radix-ui`; theme generation in `packages/tokens/build.ts`.
- `tokens.json` moved to `packages/tokens/`; `contrast.py`, `contrast_test.py`, `packages/tokens/build.ts` and the `justfile` follow.
- `packages/ui/vite.config.ts` for every output above; `rolldown-plugin-dts`; `isolatedDeclarations` in `packages/ui/tsconfig.json`; `src/index.ts` re-exporting `legacy.js` with types from `legacy.d.ts`; `glyphs.tsx`; `design-system/` sources; `just design-system`; `design/system/` removed from git and added to `.gitignore`.
- The app on `@tailwindcss/vite`, lazy routes, `import "@orasenda/ui/styles.css"`.
- `minimumSystemVersion` 15.8.2 and the build target; the CI steps; the guards; the arbitrary-value lint.
- The responsive tokens (goal 5): the `breakpoint`, `container` and `fluid` groups in `tokens.json`, their `theme.css` entries, and a test that each fluid token stays within its min and max tokens from the phone case to `2xl`.
- Before its publish: v34 saved under `design/reviews/05-v34/` (every file of version `1794308783-85b3`, read with `Artifact` `paths`) as T5's design input.

## Behavior & edge cases
- **Display gap.** The first code-first publish replaces v34, so the live artifact loses v34's `FullScreenFocus` redesign, `FloatingTimer`, Tooltip `data-os-esc` and the PopoverMenu Tab fallback until T5 merges. Accepted by the owner. The saved v34 is the reference.
- **Mixed bundle.** Between waves, `bundle.js` mixes TSX components and legacy ones. A legacy component rendered inside a migrated one (or the reverse) keeps working because both read the same tokens; their CSS does not overlap (`os-*` classes vs Tailwind utilities). The `design-system-check` renders every export, so a broken mix fails CI.
- **Radix replaces hand-written placement.** `Tooltip` and `PopoverMenu` today place a panel by script and render it inside the nearest open `<dialog>` (P1 Components, Engine baseline). On Radix, placement is Radix's Popper (flip and shift in the viewport) and the panel portals into the open `Dialog`'s content when there is one. The P1 cases stay: a Tooltip inside an open `Dialog` is visible over it; the menu inside an open `Dialog` is placed against its trigger; Esc closes only the topmost layer; Tab follows the README.
- **Preflight is off while the legacy bundle exists.** Tailwind's base reset would restyle the legacy `os-*` components and `app.css` (buttons, headings, `hr`, borders). `src/styles.css` imports only Tailwind's theme and utilities layers, plus a small base layer scoped to `[data-slot]` with the resets shadcn's classes assume (`border-style: solid`, `border-width: 0`, box-sizing, `margin: 0` on the element itself). #175 decides whether to turn Preflight on once the legacy files are gone, as its own change with its own screenshots.
- **Layering across legacy and Radix.** `Dialog` merges before `Tooltip` and `PopoverMenu` (wave 2 order). Until the legacy modal shell is gone (after wave 3), every Radix layer (`Tooltip`, `PopoverMenu`, later `CommandPalette`'s list) portals into the nearest open layer: an open Radix `Dialog`'s content if there is one, otherwise the nearest native `dialog[open]` (still in the top layer), otherwise `body`. One shared helper in `src/lib/layer.ts` returns that container, and Esc closes only the topmost layer, legacy or Radix. The P1 cases (`tooltip.spec.ts`, `popoverMenu.spec.ts` inside an open dialog) keep passing against both kinds; their `dialog[open]` selectors become `role="dialog"`.
- **Native `<dialog>` to Radix Dialog.** Expected behaviour stays: focus moves in and returns to the trigger, the background is inert, Esc and the scrim close per the README, `Dialog destructive` keeps its safe initial focus. Tests that queried `dialog[open]` query `role="dialog"`/`"alertdialog"`. The `HTMLDialogElement` shims in `test-setup.ts` go when `Dialog` migrates.
- **jsx-runtime in the classic bundle.** `react/jsx-runtime` is bundled into `bundle.js`, so the artifact declares only `react` and `react-dom`. If the foundation finds it pulls React internals that differ from `window.React`, it externalizes it to `window.React` instead (the self-built `react.js` then also assigns `jsx`, `jsxs`, `Fragment`) and records that in its PR.
- **Strict shortcuts in tests.** `window.Orasenda.strictShortcuts` (`test-setup.ts`) keeps working: `describeShortcut` reads it from `window.Orasenda` in both the library and the bundle.
- **Empty or unknown props** behave as in `bundle.js`; the migration does not add validation.
- **Responsive limits.** Hit targets (`hit-min`, `hit-floor`, `round` 52×52) and 1px borders never scale. A size is a theme utility built from tokens (breakpoint, container or fluid), never a raw number. `timerLayout` still decides ring, strip or stacked strip; container variants only size what it chose.

## Data & migrations
No product data. Repository moves, done in the foundation PR with `git mv` so history follows:
- `design/system/tokens.json` → `packages/tokens/tokens.json`.
- `design/system/README.md` → `packages/ui/design-system/README.md`; `design/system/design-system.json` → `packages/ui/design-system/design-system.json` (template).
- `design/system/components/<Name>/README.md` → `packages/ui/src/components/ui/<kebab>.md` for every component (contract-only ones included, so the artifact still documents them).
- `bundle.js` → `src/legacy.js`, `bundle.css` → `src/legacy.css`, `index.d.ts` → `src/legacy.d.ts`.
- Hand-written `preview.html` files are dropped (they are in git history and the v34 snapshot); `design/system/` is then removed from the index and ignored.
- Paths that read the old location: `verification/contrast.py:123`, `verification/contrast_test.py:103`, `packages/tokens/build.ts:1`, `packages/ui/build.ts` (deleted), `packages/ui/index.ts` (replaced), `justfile` `tokens`/`ui-css`, `biome.json` `!design/system` (kept, now for the build output), CLAUDE.md.

## Testing strategy
- **Per component (written first):** move its existing jsdom tests and keep every expectation; add cases only where the README names behaviour today's tests miss. Queries use roles and accessible names first, `data-slot` second, never `os-*` classes.
- **WebKit:** the existing `verification/layout/*.spec.ts` load `<kebab>.specimen.tsx` pages; their sizes, fit, hit-target, focus-ring, keyboard, reduced-motion and `toMatchAriaSnapshot` expectations stay. New specimens get the same case list from P1 Components Testing strategy.
- **Contrast:** `verification/contrast.py` reads `packages/tokens/tokens.json`; the declared pairs are unchanged.
- **New checks, each shown failing on a seeded case in the PR that adds it:**
  - `createElement` in `src/` (guard test);
  - an arbitrary Tailwind value (lint);
  - `bundle.js` loading as a classic script on the React 19 libs and rendering every export (`design-system-check`);
  - the copy and colour guard rescanning the TSX;
  - `tokens.css`/`theme.css` staleness;
  - `exports_*` lists the same names as today's `window.Orasenda` plus the type-only exports.
- **App:** `pnpm --filter orasenda test` and `typecheck` pass after each swap. The swap PR runs the whole `./scripts/ci.sh`.
- **Both themes:** each specimen's PR attaches light and dark screenshots; static-card components attach one of the app screen that uses them, or the card.
- **VoiceOver:** unchanged from P1 Components (owner, batched, not a merge gate).
- **Not covered here:** forced colours, Increase Contrast and WKWebView VoiceOver stay with #61.

## Decisions
- [ADR-015](../DECISIONS.md#adr-015-code-first-design-system-on-shadcn-tailwind-and-radix): code-first design system; shadcn, Tailwind v4 and Radix; minimum macOS 15.8.2.
- CONTEXT.md: **Code-first**, **Legacy bundle**, **Wave**, **Static card**, **Closed theme**; **Specimen** redefined.
- Author's calls (not owner-approved; flag in review if wrong): the `design-system/` source folder for the artifact README and json template; `legacy.css` and `legacy.d.ts` beside `legacy.js`; `glyphs.tsx` in the foundation; the shadcn semantic mapping table; bundling `react/jsx-runtime`; the GritQL-or-scan choice for the arbitrary-value lint; the jsdom `design-system-check`; no Preflight and the `[data-slot]` base layer; `Dialog` before `Tooltip` and `PopoverMenu`, and the `layer.ts` portal container; the throwaway-artifact probe; the app typechecking against source; the specimen list beyond the seven existing ones; the app importing `@orasenda/ui` from source.

### New dependencies (for `baton:deps` in the foundation task; versions looked up 2026-11-10, vet and take the latest stable then)
| Package | Where | Latest seen |
|---|---|---|
| `tailwindcss` | ui, app (dev) | 4.3.5 |
| `@tailwindcss/vite` | ui, app (dev) | 4.3.5 |
| `shadcn` (CLI, run with `pnpm dlx`, not installed) | — | 4.23.0 |
| `radix-ui` | ui | 1.8.1 |
| `class-variance-authority` | ui | 0.7.1 |
| `clsx` | ui | 2.1.1 |
| `tailwind-merge` | ui | 3.7.0 |
| `tw-animate-css` | ui | 1.4.0 |
| `rolldown-plugin-dts` | ui (dev) | 0.30.1 |
| `vite` (upgrade from 8.3.6) | ui, app (dev) | 8.3.7 |
| `@vitejs/plugin-react` (upgrade from 6.2.1) | ui, app (dev) | 6.3.0 |
| `cmdk` (wave 3, `CommandPalette`) | ui | 1.1.1 |
| `lucide-react` (T7 only, if the glyph sheet is shipped through it; #149) | ui | 1.71.0 |

React 19.3.1 and TypeScript 7.0.2 are already pinned.

## FAQ
### Why code-first now, before P1's screens?
Screens C–G will each need component touches. Design-first makes every touch a serial artifact round and a byte-for-byte copy. Code-first lets those touches ride with the screen PR and be reviewed as TSX. ADR-015 has the full reasoning.

### Why keep the artifact at all?
It is the shared, viewable design system for people and Claude sessions outside the repo. It becomes a published build, read-only by hand.

### Why one PR per component instead of a big-bang rewrite?
Each component keeps its tests green on its own, the review fits one README, and three can run at once. The legacy bundle keeps `bundle.js` and the app complete in between.

### Why do T5–T7 wait?
They change the components this migration moves. Writing them in hand-written JS first would be migrated again a week later.

### Why only about 15 specimens?
A specimen costs a page and its upkeep; it pays where WebKit measures layout. Other components are checked in jsdom and shown as a static card.

## Open questions
None at approval time. See the author's calls under Decisions.

## Implementation status
Updated by the PRs that implement this spec.
- [ ] Plan and backlog (Phase 2)
- [ ] Foundation
- [ ] Wave 1 (14 PRs)
- [ ] Wave 2 (12 PRs)
- [ ] Wave 3 (6 PRs)
- [ ] T5 #172, T6 #173, T7 #174 in TSX
- [ ] #175 close-out; legacy files deleted
