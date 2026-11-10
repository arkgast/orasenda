# P1 Components — Implementation Plan

- Spec: [docs/specs/2026-11-10-p1-components.md](../specs/2026-11-10-p1-components.md) (approved 2026-11-10, merged in #166, `120cc59`)
- Date: 2026-11-10
- Status: draft

## Planner decisions (for the architect's review)
These settle what the spec leaves to planning. Each is applied below; a ruling that changes one
is copied here before `baton:backlog`.
1. **Seven tasks in series, as the spec cuts them. No safe split found.** Every task edits
   `design/system/components/bundle.js`, `bundle.css`, `index.d.ts`, `design/system/design-system.json`,
   `packages/ui/index.ts`, `packages/ui/components.{css,d.ts}` (regenerated),
   `packages/ui/index.test.tsx` (the exports test), `packages/ui/specimens/registry.ts` and
   `verification/contrast-pairs.json`, and each republishes the one artifact. The two candidates
   for a split were checked and rejected: (a) taking `contrast.py` out of T1 into a parallel task
   fails because both halves edit the `ci` recipe in `justfile` and both jobs in
   `.github/workflows/ci.yml`; (b) running T4 (`PopoverMenu`, which needs only T2) beside T3
   fails on every file above. The one piece of work that runs beside the series is off-repo: the
   draft glyph canvas for T7 (see T7, "Before T7").
2. **Where the new dev dependencies live** (all through `baton:deps` in T1):
   `@playwright/test` is a devDependency of the workspace root `package.json` (beside
   `@biomejs/biome`), so `verification/layout/` resolves it without becoming a workspace package
   and `pnpm-workspace.yaml` is unchanged. `vite` and `@vitejs/plugin-react` are devDependencies of
   `packages/ui` at the versions `apps/orasenda` already locks (`vite` 8.3.6,
   `@vitejs/plugin-react` 6.2.1), and `@orasenda/tokens` becomes a `workspace:*` devDependency of
   `packages/ui` so the specimens import `tokens.css`. If `baton:deps` rules otherwise, T1's PR
   records the ruling and this plan's T1 Owns follows it.
3. **Specimens are one Vite page with a registry, not one HTML file per component.**
   `packages/ui/specimens/index.html` loads `main.tsx`, which renders the specimen named by
   `?c=<Name>` from `registry.ts`, with `data-theme` from `?theme=light|dark` on `<html>`. Each
   task adds one `<Name>.tsx` file and one registry line. The harness and `just specimens` use the
   same URLs. Frames come from one `Frame.tsx` (fixed width and height, `data-state`, a visible
   state label outside the frame).
4. **Component tests are one file per component** at the `packages/ui` root
   (`<component>.test.tsx`, picked up by the existing `include: ["*.ts", "*.tsx"]`), not appended
   to `index.test.tsx`. `index.test.tsx` keeps the exports test and the `index.d.ts` checks. This
   keeps each task's test diff readable.
5. **`describeShortcut`'s strict mode is a contract gap the spec leaves open.** The spec says an
   unknown key "throws in tests and returns the glyphs unchanged as `spoken` in production", but
   `bundle.js` is a plain script with no build step, so it can't see `NODE_ENV`. Proposed for the
   T2 artifact round: `window.Orasenda.strictShortcuts?: boolean`, declared in `index.d.ts`;
   `describeShortcut` throws on an unknown key when it is `true`, otherwise returns
   `{ aria: glyphs, spoken: glyphs }` and logs one `console.warn`. `packages/ui/test-setup.ts` and
   the specimens' `main.tsx` set it to `true`. The artifact round may choose another mechanism; the
   T2 PR records it.
6. **T1 proves Playwright WebKit on both machines before anything else.** Its first commit holds
   everything the runner needs to launch WebKit, not only the dependency: the pinned
   `@playwright/test`, a one-case `verification/layout/smoke.spec.ts` (with a minimal
   `playwright.config.ts`), the `ci.yml` cache step and `pnpm exec playwright install webkit`
   step on the `ci` job, a temporary `just layout` recipe that runs only `smoke.spec.ts`, and a
   `layout` call in the `ci` recipe. Today's `ci` job never runs Playwright, so a green run without
   these proves nothing. The branch is pushed as a draft PR; the `macos-26` run's log must show
   the WebKit launch line (the smoke case's `webkit <version>` output), linked in the PR. A green
   run without that line counts as a failure. The owner's macOS 27 run is recorded as a PR
   comment. If either fails, T1 stops and asks (spec, Behavior, "Playwright has no WebKit for the
   host's macOS").
7. **No eighth task to close the sub-project.** The spec counts seven. Each task ticks its own
   Implementation status line; T7 ticks the last one. The VoiceOver boxes are ticked as the owner
   records each pass, and the sub-project is closed by a docs-only PR (precedent: #163, "docs:
   close P1-B") once every box is ticked. That PR sets the spec and plan status to implemented.
   Close-out task: #175.
8. **`FloatingTimer`'s "Session ended."** The spec lets T5 choose between a live region in the
   component and an announcement by the host. Recommended for the T5 artifact round: the README
   names one always-mounted `role="status"` paragraph in `FloatingTimer`, because the floater is
   its own window and has no page status component to announce through. The convention allows
   it once the README names it (`docs/conventions.md`, "Design-system changes are checked against
   their first consumer").
9. **`document.fonts.check` alone is not proof.** It returns `true` for a family that no
   `@font-face` declares (nothing to load), so a missing rule passes it. T1's font case also
   asserts that, after `document.fonts.ready`, a `FontFace` for each family is in `document.fonts`
   with `status === "loaded"` and that its request was served from the specimen server.
10. **Who sets the menu trigger's `aria-expanded` and `aria-controls`: the host.** The trigger
    is the host's element (the preset summary, or an `IconButton` with `aria-haspopup="menu"`),
    so `PopoverMenu` never edits another component's DOM through `anchor`. T2 adds
    `aria-expanded?: boolean` and `aria-controls?: string` to `IconButtonProps` (passed through to
    the `button`) in its design-first round. T4's README says the host sets them from `open` and
    the menu's `id`, and T4's specimen and test use a host trigger that does.
11. **`StartButton`'s `singleKeys` default.** **Ruled (controller, 2026-11-10): when `singleKeys`
    is left out, StartButton renders no `aria-keyshortcuts`, exactly as today.** A control must
    never advertise shortcuts that don't work; single-key shortcuts and their off switch ship
    together in F (WCAG 2.1.4). The T3 PR adds the matching amendment line to the spec. The spec's
    default of `true` would make `Today.tsx:269-274` (which passes no `singleKeys`) announce
    `Space Meta+Enter`, which breaks Goal 6 and the "host passes only what is live" invariant.
    T3 has the test `start_button_without_single_keys_prop_matches_current_output`, asserting
    the ruled behaviour.

## Overview
The spec's seven tasks are kept as cut, in series. Each one is **design-first** and
**orchestrator-first**, as B's T1 was (`docs/plans/2026-11-09-settings.md`, ruling 6), with the
steps the spec makes explicit ("How each task runs"):
1. After the previous task's PR merges, the orchestrator asks Claude to "update the Orasenda design
   system". Claude reads the live artifact (https://claude.ai/artifact/Sk5N75HzRwY8v7dBxhsH73),
   settles the task's contract gaps (spec, "Contract gaps each task settles in the artifact
   first"), writes the components by hand in the artifact's `bundle.js` and `bundle.css`, updates
   the READMEs, previews and `index.d.ts`, and republishes once. Before the republish, **the
   orchestrator** runs the compatibility check, as part of the artifact round (it is never the
   implementer's, because no implementer worktree exists yet). The exact steps:
   ```sh
   git -C <repo> worktree add .worktrees/<task>-compat origin/main
   cp <draft index.d.ts> .worktrees/<task>-compat/design/system/components/index.d.ts
   (builtin cd .worktrees/<task>-compat && pnpm install --frozen-lockfile && just ui-css \
     && pnpm --filter orasenda typecheck)
   git -C <repo> worktree remove --force .worktrees/<task>-compat
   ```
   (`packages/ui/build.ts` reads `design/system/components/` directly, which is why the draft
   replaces that file in the scratch worktree.) The orchestrator pastes the typecheck output into
   the task's issue. A break stops the task for a ruling (opus; fable only if the ruling changes
   scope). App files are never edited. The implementer re-runs `pnpm --filter orasenda typecheck`
   after the refresh as a recorded acceptance item (T3, T5, T6).
2. The implementer refreshes `design/system/` from that version's published files (`Artifact`
   read with `paths`), byte for byte. If the live version is newer than the one the orchestrator
   named, someone else republished: stop.
3. The implementer runs `just ui-css`, exports the new names from `packages/ui/index.ts`, writes
   the component tests first, then the specimen, the harness spec and the contrast pairs.
4. A fix the review asks for in a component goes back through step 1 as a new version. Nothing in
   `design/system/` or in a component's runtime in `packages/ui` is patched alone.

| Plan task | Spec task | Builds | First consumers |
|---|---|---|---|
| **T1** (#168) | T1 | Playwright WebKit harness, specimen server and seed specimen; bundled fonts and `type.fonts`; `verification/contrast.py`; the copy and colour guard; `ci` and `ci.yml` | every later task; C's Today cases |
| **T2** (#169) | T2 | `IconButton`, `Tooltip`, `Kbd`, `describeShortcut` | C, D, F |
| **T3** (#170) | T3 | `TimerRing` fluid and the warning fade, `TimerStrip`, `timerLayout`, `StartButton` redesign | C, D, E |
| **T4** (#171) | T4 | `PopoverMenu` | C, D |
| **T5** (#172) | T5 | `FullScreenFocus` redesign, `FloatingTimer` | D, E |
| **T6** (#173) | T6 | `CommandPalette` redesign, `CapturePad` copy, `ShortcutRecorder` | D, F |
| **T7** (#174) | T7 | `Icon` and `IconName`, final glyphs, `NavRail` roving focus and rail icons, `StartButton` and specimens on `Icon` | C, D |

**Conventions for every task** (from `docs/conventions.md`, `CLAUDE.md` and the spec):
- Under design-first, nothing in `design/system/` is edited by hand. Every PR links the artifact
  version it refreshed from (`design-system.json` `lastChange`).
- Every colour, size, spacing, radius, shadow and duration in `bundle.css` and in the specimens
  is a token. Specimen frames take their sizes from the README's case list.
- **Field errors are never live regions.** A field's error links to its control with
  `aria-describedby`. Any other component adds `role="status"`, `role="alert"` or `aria-live`
  only where its README names one.
- **Ids are settable.** An id that another element references is a prop.
- **Components own no state** beyond what is on screen (open, hovered, recording, the roving
  index), never read a setting, and never compute time. Shortcuts arrive as glyph strings or
  `singleKeys`.
- **Copy:** no "!", no emoji, no shaming. `critical` appears only in `Dialog destructive` and
  `Button variant="critical"`; no red for time.
- **Compatibility:** every change to an existing component adds to it. Current props keep their
  current output (spec, Goal 6).
- **Engine baseline:** no popover API and no CSS anchor positioning (Safari 17 and 26; the app's
  floor is macOS 13, Safari 16.0). `dialog.showModal()`, `:focus-visible`, container queries and
  `inert` are allowed.
- **The review** reads the canvas and the README slot tables of the consumer named in the
  spec's inventory, and checks every new or changed component against them (`docs/conventions.md`,
  "Design-system changes are checked against their first consumer"). Canvases:
  timer surfaces https://claude.ai/artifact/9pNxL32QEEq66j5QyAW1GX, Settings
  https://claude.ai/artifact/GrTgYRHtYxbKh7RVBpbQn1, onboarding
  https://claude.ai/artifact/XPG6fXqiVfT8y1gTxpzKoz.
- **Every task closes with** both themes checked, the keyboard path, hit targets, the
  accessibility-tree snapshot, reduced motion, contrast through `contrast.py`, `./scripts/ci.sh`
  green, and light and dark screenshots of the specimen from the harness attached to the PR. Its
  VoiceOver pass is listed under "Not yet verified" until the owner records it (spec, Testing
  strategy, VoiceOver).
- **Green CI** means `gh pr checks <pr> --required` passes and `windows (advisory)` is green
  (it has been since #78, so red is a regression). Agents check once, never with `--watch`. Each
  task is one squash-merged PR.

## Contract
- **Design-system contract, per task:** the props each task declares in the artifact's
  `index.d.ts` and that `packages/ui/components.d.ts` copies. The names fixed by the spec are in
  each task's Produces line. Names the spec leaves to the artifact round are marked "proposed";
  the artifact is binding, and the implementer copies the final props into the task's issue.
- **Harness contract (T1):** `verification/layout/playwright.config.ts` with the projects
  `light`, `dark` and `light-reduced-motion`; the specimen URL scheme
  `/?c=<Name>&theme=light|dark`; and the helpers in `verification/layout/support/` that every
  later spec file uses. T2–T7 add spec files and helpers. They don't change a project, the URL
  scheme or an existing helper's signature without listing it in Touches.
- **Contrast contract (T1):** the `verification/contrast-pairs.json` entry shape
  `{ "fg": string, "bg": string, "kind": "text" | "mark", "where": string }`, plus the floater form
  `{ "fill": string, "edge": string, "wallpaper": string[], "kind": "mark", "where": string,
  "rule": "fill-or-edge" }`. Later tasks only append entries.
- **No IPC, Rust or app changes.** `apps/orasenda/src/**` and `bindings.ts` are read-only for
  every task.

## Impact
Risky changes: a shared module that the app imports (`@orasenda/ui`, `tokens.css`), the required
`ci` check and its workflow, new dev dependencies, and font files that ship in the app bundle.
- **Affected call paths / consumers:**
  - `packages/ui` is imported by `App.tsx` (`NavRail`), `pages/Today.tsx` (`Button`,
    `InlineNotice`, `Input`, `ModeChip`, `StartButton`, `TimerRing`), `pages/settings/**`,
    `spike/DevPanel.tsx` and `spike/Overlay.tsx` (`Button`, `IntentPrompt`).
  - `StartButton` (T3, T7): `Today.tsx:269` passes `finishTime`; `Today.test.tsx:162,178` assert
    "Realistic finish · 14:57" and "· 15:20"; `Today.test.tsx` and `App.test.tsx:122` find the
    button by the name or text "Start focus". The deprecated `finishTime` and `disabled` keep their
    output, and the name stays "Start focus" in every form.
  - `TimerRing` (T3): `Today.tsx:187` passes a numeric `size`; its output stays the same.
  - `NavRail` (T7): `App.test.tsx:72-82` finds the rail by `navigation` "Main navigation" and its
    items as `button`s with `aria-current="page"`. The items stay `button`s with those names;
    only their `tabIndex` (roving) and glyphs change.
  - `CapturePad` (T6) and `CommandPalette` (T6) have no app consumer yet; their current props keep
    working.
  - `tokens.css` (T1) is imported by `styles/app.css`, `spike/spike.css` and `spike/overlay.css`;
    it gains `@font-face` rules with relative `url()`s that Vite rebases and copies into `dist/`.
    The app's CSP (`tauri.conf.json:24`, `default-src 'self'`) covers fonts from the app's own
    origin, so it needs no change. `packages/ui/build.ts` rejects `url(` in `bundle.css`, so
    `@font-face` must live in `tokens.css` only, never in `bundle.css`.
  - CI (T1): the `ci` job keeps its id and name (branch protection requires the `ci` context) and
    gains `setup-python`, a Playwright browser cache and `playwright install webkit`; the
    `windows` job gains `setup-python`. Both new steps are skipped on the docs-only path.
- **Data and migrations:** none. `tokens.json` changes only in `type.fonts` (T1, artifact first).
- **Tests and downstream checks that must stay green:** `pnpm --filter orasenda typecheck` and
  `test` (Today, Settings, App), `pnpm --filter @orasenda/tokens test` (every existing case,
  including `output_is_deterministic` and `dark_block_guarded_and_repeated_under_data_theme_dark`),
  `pnpm --filter @orasenda/ui typecheck` and `test`, the `tokens` and `ui-css` staleness diffs in
  `ci`, `pnpm exec biome ci .` (the `a11y` group blocks; specimens and harness files are linted),
  the app debug build (`tauri build --debug --no-bundle`), and `./scripts/docs-only.test.sh`.
- **Rollout and rollback:** each task is one squash-merged PR. To roll one back, revert the PR
  and republish the previous artifact version, then refresh `design/system/` from it in the same
  revert PR, so the repo and the artifact match again. Reverting T1 also drops the fonts from the
  app; the font stacks in `tokens.json` fall back to the system fonts.

## Dependency graph
```
Serial order:   T1 ──> T2 ──> T3 ──> T4 ──> T5 ──> T6 ──> T7
Real needs:     T2 <- T1;  T3 <- T2;  T4 <- T2;  T5 <- T3, T4;  T6 <- T2;  T7 <- T2 + glyph approval
Off-repo:       after T2 merges: draft glyph canvas ──(owner approval)──> T7
```
- Real dependencies: T2 needs T1 (harness, specimens, contrast). T3 needs T2 (`describeShortcut`
  for `StartButton`'s `aria-keyshortcuts`). T4 needs T2
  (`describeShortcut` for the P key, the positioned-panel helper shared with `Tooltip`). T5 needs
  T3 (`TimerRing` fluid, `TimerStrip`, `timerLayout`) and T4 (the summary trigger opens a
  `PopoverMenu`). T6 needs T2 (`Kbd`, `IconButton`, `describeShortcut`). T7 needs T2 (`IconButton`
  takes `Icon`) and the owner's glyph approval.
- Serial order (planner decision 1): T1 → T2 → T3 → T4 → T5 → T6 → T7. Each task's artifact round
  starts only after the previous PR merges.
- No cycles. Nothing can start in parallel except the off-repo glyph canvas.

### File ownership: who edits each shared file, and when
Tasks run one at a time, so ownership here records the order and stops a task from editing
something no task names. "own" = the task creates or rewrites it; "add" = the task appends
(a line, an entry, a test, a section); "regen" = regenerated by `just ui-css` or `just tokens`.

| File | T1 | T2 | T3 | T4 | T5 | T6 | T7 |
|---|---|---|---|---|---|---|---|
| `design/system/**` (refresh of the republished version) | own (`tokens.json` `type.fonts`, README Type and Colour lines) | own | own | own | own | own | own |
| `design/system/components/bundle.js` and the `window.Orasenda` export line | read (guard scans it) | add | add | add | add | add | add |
| `design/system/components/index.d.ts` (`declare global` block) | | add | add | add | add | add | add |
| `packages/ui/index.ts` (destructured exports) | | add | add | add | add | add | add |
| `packages/ui/components.css`, `components.d.ts` | regen (unchanged) | regen | regen | regen | regen | regen | regen |
| `packages/ui/index.test.tsx` (`exports_every_namespace_member`, `index.d.ts` checks) | | add | add | add | add | add | add |
| `packages/ui/test-setup.ts` | | add (`strictShortcuts`) | | | | | |
| `packages/ui/specimens/{index.html,main.tsx,Frame.tsx,vite.config.ts,specimens.css}` | own | add (`strictShortcuts` in `main.tsx`) | | | | | touch (placeholder glyphs → `Icon`) |
| `packages/ui/specimens/registry.ts` | own | add | add | add | add | add | add |
| `packages/ui/specimens/<Name>.tsx` | own (`Seed.tsx`) | own (its own) | own | own | own | own | own, plus touch every earlier one (glyphs) |
| `packages/ui/package.json`, `tsconfig.json` | own (deps, `specimens` script, include `specimens/**`) | | | | | | |
| `verification/layout/playwright.config.ts`, `support/**` | own | add (helpers only) | add | add | add | add | add |
| `verification/layout/<name>.spec.ts` | own (`seed.spec.ts`) | own (its own) | own | own | own | own | own |
| `verification/contrast.py`, `contrast_test.py` | own | | | | | | |
| `verification/contrast-pairs.json` | own (seeded) | add | add | add | add | add | add |
| `packages/tokens/**` (`build.ts`, `build.test.ts`, `tokens.css`, `fonts/**`, `package.json`) | own | | | | | | |
| `justfile`, `.github/workflows/ci.yml`, root `package.json`, `pnpm-lock.yaml`, `.gitignore` | own | | | | | | |
| spec Implementation status | add (T1 line) | add (T2 line) | add | add | add | add | add (T7 line) |
| `apps/orasenda/src/**` | read (typecheck, test) | read | read | read | read | read | read |

## Tasks

### T1: Real-engine harness, bundled fonts and the contrast check (#168)
- Priority: 0
- Kind: cross-file/debugging (new tooling across CI, tokens and the design system; one small
  artifact round for `type.fonts` and two README lines)
- Depends on: none
- Owns:
  - `verification/layout/playwright.config.ts`, `verification/layout/support/{specimen.ts,fits.ts,hitTargets.ts,focusRing.ts,motion.ts,fonts.ts,network.ts}`,
    `verification/layout/seed.spec.ts`, `verification/layout/smoke.spec.ts` (the first-commit
    launch check; it may be folded into `seed.spec.ts` once green)
  - `verification/contrast.py`, `verification/contrast_test.py`, `verification/contrast-pairs.json`
  - `packages/ui/specimens/{index.html,main.tsx,registry.ts,Frame.tsx,Seed.tsx,vite.config.ts,specimens.css}`,
    `packages/ui/guard.test.ts` (the copy and colour guard), `packages/ui/package.json`
    (`vite`, `@vitejs/plugin-react`, `@orasenda/tokens: workspace:*`, script
    `"specimens": "vite --config specimens/vite.config.ts"`), `packages/ui/tsconfig.json`
    (include `specimens/**/*.ts`, `specimens/**/*.tsx`)
  - `packages/tokens/fonts/{AtkinsonHyperlegibleNext,AtkinsonHyperlegibleMono,Lexend}/` (the
    upstream variable `woff2`, roman, `wght` axis, unmodified, each with its `OFL.txt`),
    `packages/tokens/build.ts` (`@font-face` from `type.fonts`), `packages/tokens/build.test.ts`,
    `packages/tokens/tokens.css` (regenerated with `just tokens`), `packages/tokens/package.json`
    (`files` and `exports` gain `fonts/**`)
  - `design/system/tokens.json` (`type.fonts`), `design/system/README.md` (the Type line about
    `type.fonts` and the Colour line about `contrast.py`), `design/system/design-system.json`:
    all from the artifact refresh only
  - `justfile`: a `python` variable (`python` on Windows, `python3` elsewhere), recipes
    `contrast`, `layout` (skips on non-Darwin like `mobile`; on Darwin fails with
    `pnpm exec playwright install webkit` when the browser is missing) and `specimens`; in `ci`,
    `contrast` runs before the `tokens` step and `layout` after the ui tests. In checkpoint 1
    `layout` is a temporary recipe that runs only `smoke.spec.ts`; checkpoint 4 replaces it.
  - `.github/workflows/ci.yml`: a pinned `actions/setup-python` step (Python 3.13) on both jobs;
    on the macOS `ci` job, a SHA-pinned `actions/cache` step (with a version comment, like every
    other action in the file) for `~/Library/Caches/ms-playwright` keyed on
    the `@playwright/test` version from `pnpm-lock.yaml`, then `pnpm exec playwright install
    webkit` before `./scripts/ci.sh`; all new steps carry `if: steps.scope.outputs.docs_only !=
    'true'`
  - root `package.json` (`@playwright/test`, pinned exactly), `pnpm-lock.yaml`, `.gitignore`
    (`test-results/`, `playwright-report/`)
- Touches (read-only or additive):
  - `docs/specs/2026-11-10-p1-components.md`: ticks the T1 line in Implementation status only
  - `packages/ui/build.ts` (read: its `url(` guard means `@font-face` never goes in `bundle.css`;
    unchanged)
  - `apps/orasenda/src/**` and `apps/orasenda/src-tauri/tauri.conf.json` (read: the CSP's
    `default-src 'self'` covers bundled fonts; no edit)
  - `design/reviews/04-redesign-pass/04-ds-changeset.md` §9 and the `FloatingTimer` and
    `TimerStrip` README tables (read: the pairs `contrast-pairs.json` is seeded with)
  - `scripts/ci.sh` (read: stays `exec just ci`), `scripts/docs-only.sh` (read: `verification/**`
    is code, so a T1 PR runs every check)
  - GitHub: a comment on #149 adding the three OFL notices; the PR body states the added bundle
    size
- Interfaces:
  - Consumes: `design/system/tokens.json` `type.families` and `type.groups` (weights used: sans
    400, 500, 600; mono 300, 400, 500; alt 400); the README case list
    (`design/system/README.md:53`)
  - Produces:
    - `tokens.json`: `type.fonts: Array<{ family: string; file: string; weight: string; style:
      "normal" }>` (proposed shape; `file` relative to `packages/tokens/`, e.g.
      `fonts/AtkinsonHyperlegibleNext/<upstream file>.woff2`; `weight` a range such as
      `"200 800"`). The artifact round is binding.
    - `tokens.css`: one `@font-face { font-family; src: url("./<file>") format("woff2");
      font-weight: <range>; font-style: normal; font-display: block }` per entry, before `:root`
    - `verification/layout/support/specimen.ts`: `openSpecimen(page: Page, name: string, opts?:
      { theme?: "light" | "dark" }): Promise<void>` (waits for `document.fonts.ready`);
      `frames(page: Page): Locator` (every `[data-frame]`)
    - `support/fits.ts`: `overflows(frame: Locator): Promise<string[]>` (each descendant whose
      `scrollWidth > clientWidth` or `scrollHeight > clientHeight`, by `data-state`);
      `expectFits(frame: Locator): Promise<void>`
    - `support/hitTargets.ts`: `smallTargets(scope: Locator, min?: { width: number; height:
      number }): Promise<string[]>` (default `hit-min`, read from the computed `--hit-min`)
    - `support/focusRing.ts`: `expectFocusRingVisible(el: Locator): Promise<void>` (outline or
      box-shadow present and not clipped by any ancestor's `overflow`)
    - `support/motion.ts`: `animatedElements(page: Page): Promise<string[]>` (any element with a
      non-zero computed `transition-duration` or a running `animation-name`)
    - `support/fonts.ts`: `FONT_FACES: Array<{ family: string; weight: number }>` (from
      `tokens.json`), `expectBundledFontsLoaded(page: Page): Promise<void>`
    - `support/network.ts`: `recordRequests(page: Page): () => URL[]`
    - `packages/ui/specimens/Frame.tsx`: `Frame(props: { state: string; width: number; height:
      number; children: React.ReactNode }): React.ReactElement`
    - `packages/ui/specimens/registry.ts`: `export const specimens: Record<string, () =>
      React.ReactElement>`
    - `verification/contrast.py`: CLI `python3 verification/contrast.py [--tokens <path>]
      [--pairs <path>]`; prints each pair's ratio in light and dark; exit 1 on any failure,
      2 on a bad input (unknown token, malformed entry)
    - `justfile`: `just layout`, `just specimens`, `just contrast`
- Step zero (orchestrator, before the artifact round): fetch the three upstream font releases
  (`googlefonts/atkinson-hyperlegible-next`, `googlefonts/atkinson-hyperlegible-next-mono`,
  `googlefonts/lexend`) into a scratch folder and record in the T1 issue, per family: repository,
  release tag or commit, the variable roman `woff2` file name, its SHA-256 and its `wght` range
  (read from the file's `fvar` table). Each range must cover the weights listed under Consumes;
  if one doesn't, stop and ask before the artifact round. The artifact round writes `type.fonts`
  from that record, so the republish never waits on the implementer.
- Checkpoints: one PR, as the spec cuts it, built as commits in this order. After each
  checkpoint the implementer may stop and report (the branch pushed, the PR still a draft):
  1. Smoke and CI launch (planner decision 6): the pinned `@playwright/test`, a minimal
     `playwright.config.ts`, `smoke.spec.ts`, the `ci.yml` steps (`setup-python`, `actions/cache`,
     `playwright install webkit`), the temporary `layout` recipe and its call in `ci`.
  2. Fonts and tokens: the refresh from the artifact, the font files (SHA-256 checked against
     the step-zero record), `build.ts`, `build.test.ts`, `tokens.css`, `packages/tokens/package.json`.
  3. Contrast: `contrast.py`, `contrast_test.py`, the seeded `contrast-pairs.json`, `just contrast`
     and its place in `ci`.
  4. Harness helpers and the seed: `support/**`, the specimen server, `Seed.tsx`, `seed.spec.ts`
     (the smoke case folds in), the final `layout` and `specimens` recipes.
  5. The guard: `guard.test.ts`; then the manual app check and the #149 comment.
- Acceptance:
  - [ ] **First, before any other T1 work (checkpoint 1):** the first commit holds the pinned
    `@playwright/test`, `smoke.spec.ts`, the `ci.yml` setup, cache and `pnpm exec playwright
    install webkit` steps, a temporary `just layout` recipe that runs `smoke.spec.ts`, and a
    `layout` call in the `ci` recipe. The draft PR's `ci` run on `macos-26` passes and its log
    shows the WebKit launch line; the PR links that log line. If the line is missing, the task
    stops and asks even when the run is green. The owner's macOS 27 run is recorded as a PR
    comment with `playwright --version` and the launch output. If either fails, the task stops
    and asks (planner decision 6).
  - [ ] `@playwright/test`, `vite`, `@vitejs/plugin-react`, the `actions/setup-python` pin and
    the `actions/cache` pin (SHA-pinned, with a version comment) went through `baton:deps`; the PR
    lists each version and the reason. The font files are vetted the same way: upstream
    repository, release tag or commit, and SHA-256 of each file, in the PR body, matching the
    step-zero record in the issue.
  - [ ] **Design-first, in order:** the orchestrator republishes the artifact with `type.fonts`
    filled from the step-zero record and the README's Type line ("`type.fonts` is empty…") and Colour line ("to be added as
    `verification/contrast.py`") saying both exist; `design/system/` is refreshed byte for byte;
    the PR links the artifact version. Only `tokens.json`, `README.md` and `design-system.json`
    change in `design/system/`.
  - [ ] `tokens.css` declares one `@font-face` per `type.fonts` entry; the existing `--font-*`
    stacks are unchanged; `packages/ui/components.css` is unchanged.
  - [ ] `just specimens` serves `http://localhost:<port>/?c=Seed&theme=dark` with the bundled
    fonts and no request to `fonts.googleapis.com`, `fonts.gstatic.com` or any other host.
  - [ ] `just layout` runs `seed.spec.ts` in the `light`, `dark` and `light-reduced-motion`
    projects (`retries: 0` locally, `retries: 1` with `trace: "on-first-retry"` when `CI` is
    set). On a non-Darwin host it prints a skip line and exits 0. On Darwin without the browser
    it fails and prints `pnpm exec playwright install webkit` (checked by hand with the cache
    folder renamed; recorded in the PR).
  - [ ] The seed specimen (`TimerRing` and `InlineNotice variant="row"` with the "Open Settings"
    action, at 360 wide) fits its frames in all three projects; the seeded overflow frame is
    reported by `overflows`.
  - [ ] `just contrast` passes with the seeded pairs (changeset §9, the `FloatingTimer` and
    `TimerStrip` README tables, the three wallpapers `#EDEDED`, `#808080`, `#1C1C1E`); its self
    test fails a seeded text pair under 4.5:1 and a floater whose fill and edge are both under
    3:1.
  - [ ] `just ci` runs `contrast` before the tokens step on every platform and `layout` after
    the ui tests on macOS; `scripts/ci.sh` is still `exec just ci`.
  - [ ] `ci.yml`: both jobs get the pinned `setup-python` (3.13); the `ci` job caches
    `~/Library/Caches/ms-playwright` and installs WebKit before `./scripts/ci.sh`; the `ci` job's
    id and name are unchanged; a docs-only PR skips every new step.
  - [ ] The copy and colour guard passes on today's `bundle.js`.
  - [ ] **Manual (the font change is visible in the app):** `pnpm tauri dev`, the Settings page
    at 900×600 and 1440×900 in light and dark: the page doesn't scroll and no line is clipped;
    the four screenshots are in the PR. Today renders in Atkinson Hyperlegible.
  - [ ] #149 has a comment adding the three OFL notices; the PR states the bundle size added.
  - [ ] `pnpm --filter orasenda typecheck` and `test`, `pnpm --filter @orasenda/ui typecheck`
    and `test`, `pnpm --filter @orasenda/tokens test` and `./scripts/ci.sh` pass; required checks
    and `windows (advisory)` are green.
- Tests first:
  - `packages/tokens/build.test.ts`: `emits_font_face_per_type_fonts_entry`,
    `font_face_src_is_relative_woff2_url`, `font_faces_come_before_root_block`,
    `type_fonts_entry_without_file_fails`, `type_fonts_family_not_in_families_fails`,
    `every_weight_a_type_style_uses_is_inside_a_font_range`; every existing case stays green
  - `packages/ui/guard.test.ts`: `bundle_copy_has_no_exclamation_mark`,
    `bundle_copy_has_no_emoji`, `critical_used_only_by_destructive_dialog_and_critical_button`
  - `verification/contrast_test.py` (`unittest`, run by `just contrast`):
    `test_text_pair_at_4_5_passes`, `test_seeded_text_pair_under_4_5_fails`,
    `test_mark_pair_uses_3_to_1`, `test_floater_fails_when_fill_and_edge_both_under_3`,
    `test_floater_passes_when_edge_holds_on_every_wallpaper`, `test_token_reference_resolves`,
    `test_unknown_token_exits_2`
  - `verification/layout/seed.spec.ts`: `playwright_launches_webkit` (the smoke case),
    `seed_states_fit_their_frames`, `seeded_overflow_is_reported`,
    `bundled_fonts_loaded_for_every_family_and_weight`, `no_request_leaves_the_specimen_server`,
    `seed_focusables_meet_hit_min`, `seed_focus_ring_visible_and_unclipped`,
    `reduced_motion_leaves_no_transition_or_animation` (runs in `light-reduced-motion` only),
    `seed_aria_snapshot`
- Notes: `document.fonts.check` passes for a family no `@font-face` declares (planner
  decision 9), so `expectBundledFontsLoaded` also iterates `document.fonts` for a loaded
  `FontFace` per family and checks each was served by the specimen server. The seeded overflow
  is a dedicated frame in `Seed.tsx` (`data-state="seeded-overflow"`) that the spec expects
  `overflows` to report; it isn't `test.fail()`, so CI stays green while proving the check bites.
  Playwright's `webServer` starts `pnpm --filter @orasenda/ui specimens --port <fixed>
  --strictPort` with `reuseExistingServer: !process.env.CI`. The Windows job installs
  `@playwright/test` with the workspace but never downloads a browser; `layout` skips there.
  Upstream font repositories: `googlefonts/atkinson-hyperlegible-next`,
  `googlefonts/atkinson-hyperlegible-next-mono` (the spec's "-mono"), `googlefonts/lexend`;
  their file names and `wght` ranges come from step zero, and the implementer only checks the
  downloaded files' SHA-256 against that record. Lexend
  has no P1 consumer but ships because `--font-alt` names it.

### T2: The small controls and the key table (#169)
- Priority: 0
- Kind: design-system (orchestrator-first)
- Depends on: T1
- Owns:
  - `design/system/**` (refresh: `bundle.js`, `bundle.css`, `index.d.ts`, `design-system.json`,
    `components/{IconButton,Tooltip,Kbd}/{README.md,preview.html}`)
  - `packages/ui/index.ts` (adds `IconButton`, `Tooltip`, `Kbd`, `describeShortcut`),
    `packages/ui/components.{css,d.ts}` (regen), `packages/ui/index.test.tsx` (exports list)
  - `packages/ui/{describeShortcut,iconButton,tooltip,kbd}.test.tsx`, `packages/ui/test-setup.ts`
    (sets `window.Orasenda.strictShortcuts = true` before `bundle.js` runs, or as decided)
  - `packages/ui/specimens/{IconButton,Tooltip,Kbd}.tsx`, `registry.ts` (three lines),
    `main.tsx` (the strict flag)
  - `verification/layout/{iconButton,tooltip,kbd}.spec.ts`; `support/**` (additive only)
  - `verification/contrast-pairs.json` (append: tooltip text and `Kbd` on `surface-raised`,
    `IconButton` glyph and edge in rest, hover and pressed, both themes)
- Touches (read-only or additive): `docs/specs/2026-11-10-p1-components.md` (ticks the T2 line;
  the VoiceOver boxes stay for the owner); GitHub #61 (one line: the positioned-panel placement
  of `Tooltip` inside an open `<dialog>`, to check on the macOS 13 system WebKit);
  `apps/orasenda/src/**` (read: typecheck and test)
- Interfaces:
  - Consumes: T1's harness helpers (`openSpecimen`, `expectFits`, `smallTargets`,
    `expectFocusRingVisible`, `animatedElements`), `Frame`, `specimens`
  - Produces:
    - `describeShortcut(glyphs: string): { aria: string; spoken: string }` (spec, Key table):
      modifiers in macOS order `⌃⌥⇧⌘` then one key from `F`-style letters and digits, `.`, `,`,
      `↩`, `Space`, `Esc`, `⌫`, `←↑→↓`, `Tab`. `⌃⌥F` → `{ aria: "Control+Alt+F", spoken:
      "Control-Option-F" }`; `⌘.` → `{ aria: "Meta+Period", spoken: "Command-Period" }`
    - `window.Orasenda.strictShortcuts?: boolean` (proposed, planner decision 5)
    - `IconButtonProps { label: string; icon: React.ReactNode; shortcut?: string; size?: 'md' |
      'round'; onClick?: () => void; disabled?: boolean; 'aria-haspopup'?: 'menu'; id?: string;
      'aria-expanded'?: boolean; 'aria-controls'?: string }` (the spec adds `id`; `shortcut` is
      one canonical glyph string; `aria-expanded` and `aria-controls` are passed through to the
      `button` so a host trigger can point at T4's `PopoverMenu`: the plan's ruling on who sets
      them, see T4)
    - `TooltipProps { label: string; shortcut?: string; placement?: 'auto' }` plus whatever the
      artifact round adds for the anchor (proposed: `IconButton` renders its own `Tooltip`; a
      standalone `Tooltip` wraps one focusable child)
    - `KbdProps` as declared today (`keys`, `inTooltip`, `spoken`)
    - The positioned-panel helper inside `bundle.js` (not exported): placed from the trigger's
      `getBoundingClientRect()`, flipped inside the viewport, re-placed on resize and scroll,
      rendered into the nearest open `<dialog>` or the page root. T4 reuses it.
- Acceptance:
  - [ ] **Design-first, in order:** the orchestrator republishes with `IconButton`, `Tooltip`,
    `Kbd` and `describeShortcut` in `bundle.js`; the "Shortcut glyphs" section in the `Kbd`
    README; `id`, `aria-expanded` and `aria-controls` on `IconButton` (in `index.d.ts` and its
    README); the Tooltip placement paragraph (positioned panel, nearest open
    dialog or page root, no popover API); and the strict-mode mechanism. `design/system/` is
    refreshed byte for byte; the PR links the version.
  - [ ] `index.d.ts` no longer marks `IconButton`, `Tooltip` or `Kbd` "Not implemented in
    bundle.js yet"; `window.Orasenda` and the `declare global` block list the four names.
  - [ ] `IconButton`'s accessible name is its `label`; the icon is `aria-hidden`; `shortcut`
    sets `aria-keyshortcuts` from `describeShortcut(...).aria`; `md` is at least 44×44 and
    `round` at least 52×52 in WebKit.
  - [ ] `Tooltip` shows on hover after `duration-quick`; on focus only after a keyboard event
    (`:focus-visible`); Esc hides it; it stays while hovered; inside an open `showModal()` dialog
    it is visible above the dialog; at 40ch it wraps to two lines and its `Kbd` doesn't break.
  - [ ] `Kbd` hides its glyphs from assistive tech and speaks `spoken` in running text.
  - [ ] No new live region (`role="status"`, `role="alert"`, `aria-live`) in any of the three.
  - [ ] Every key `describeShortcut` accepts round-trips (the table, both ways); an unknown key
    throws when strict and returns the glyphs unchanged otherwise.
  - [ ] Harness: the three specimens fit, meet their hit sizes, show a visible focus ring, pass
    the keyboard path with `page.keyboard` only, match the README's names in the
    accessibility-tree snapshot, and have no motion under `light-reduced-motion`. Light and dark
    screenshots in the PR.
  - [ ] `contrast.py` passes with the new pairs. #61 has its line.
  - [ ] Review against the timer-surfaces canvas (Today's Pause/Resume/End, Pages, Jump to
    section; Focus view, Leave full screen, floater) and the Settings canvas for `Kbd`.
  - [ ] `pnpm --filter orasenda typecheck` and `test` pass with no app edit; `./scripts/ci.sh`
    passes; required checks and `windows (advisory)` green.
- Tests first:
  - `describeShortcut.test.tsx`: `describe_shortcut_control_option_f`,
    `describe_shortcut_command_period`, `describe_shortcut_named_keys` (`↩`, `Space`, `Esc`, `⌫`,
    arrows), `describe_shortcut_round_trips_every_table_key`,
    `describe_shortcut_unknown_key_throws_when_strict`,
    `describe_shortcut_unknown_key_returns_glyphs_when_not_strict`
  - `iconButton.test.tsx`: `icon_button_name_is_label_and_icon_hidden`,
    `icon_button_shortcut_sets_aria_keyshortcuts`, `icon_button_without_shortcut_has_no_keyshortcuts`,
    `icon_button_id_passes_through`, `icon_button_haspopup_passes_through`,
    `icon_button_expanded_and_controls_pass_through`,
    `icon_button_round_size_class`
  - `tooltip.test.tsx`: `tooltip_shows_on_hover_after_duration_quick`,
    `tooltip_shows_on_focus_only_after_keyboard_event`, `tooltip_esc_hides`,
    `tooltip_stays_while_hovered`, `tooltip_renders_inside_nearest_open_dialog`,
    `tooltip_adds_no_live_region`
  - `kbd.test.tsx`: `kbd_glyph_hidden_and_spoken_in_text`, `kbd_in_tooltip_needs_no_spoken`
  - harness: `icon_button_hit_boxes_md_44_round_52`, `tooltip_40ch_two_lines_kbd_unbroken`,
    `tooltip_visible_above_open_dialog`, `tooltip_keyboard_path_focus_shows_esc_hides`,
    `tooltip_not_shown_on_programmatic_focus`, `small_controls_fit_and_ring_visible`,
    `small_controls_aria_snapshot`, `small_controls_no_motion_when_reduced`
- Notes: the specimens use the current placeholder glyphs (the rail's inline SVG paths, or text)
  through `icon: ReactNode`; T7 swaps them for `Icon`. Glyph strings are canonical; never accept
  `Cmd+.` text in `describeShortcut`. Don't use the popover API or anchor positioning (Engine
  baseline). Watch out for `:focus-visible` after programmatic focus: WebKit and jsdom differ,
  which is why `tooltip_not_shown_on_programmatic_focus` is a harness case.

### T3: Timer faces and Start (#170)
- Priority: 0
- Kind: design-system (orchestrator-first)
- Depends on: T2
- Owns:
  - `design/system/**` (refresh: `bundle.js`, `bundle.css`, `index.d.ts` with
    `TimerRingNextProps` and `StartButtonNextProps` folded and deleted, `design-system.json`,
    `components/{TimerRing,TimerStrip,StartButton}/{README.md,preview.html}`)
  - `packages/ui/index.ts` (adds `TimerStrip`, `timerLayout`), `components.{css,d.ts}` (regen),
    `index.test.tsx`
  - `packages/ui/{timerLayout,timerRing,timerStrip,startButton}.test.tsx`
  - `packages/ui/specimens/{TimerRing,TimerStrip,StartButton}.tsx`, `registry.ts`
  - `verification/layout/{timerRing,timerStrip,startButton}.spec.ts`; `support/**` (additive)
  - `verification/contrast-pairs.json` (append: strip bar and triangle, break and warning arcs
    and chips, Start's play glyph, both themes)
- Touches (read-only or additive): `docs/specs/2026-11-10-p1-components.md` (ticks the T3 line;
  adds one amendment line recording the `singleKeys` ruling, planner decision 11; if the canvas's content boxes give a different Today result in the `timerLayout` table, the
  README value wins and the PR says which row changed: the spec table is not edited);
  `apps/orasenda/src/pages/Today.tsx` and `Today.test.tsx`, `App.test.tsx` (read: they must pass
  unchanged); `design/system/tokens.json` (read: the `layout-*` and `timer-*` constants)
- Interfaces:
  - Consumes: `describeShortcut` (T2), T1's harness helpers
  - Produces:
    - `timerLayout(box: { contentWidth: number; contentHeight: number; windowWidth: number }):
      "ring" | "strip" | "stackedStrip"` (spec rule: `contentHeight < 360` → `strip` if
      `windowWidth >= 640`, else `stackedStrip`; otherwise `contentWidth > 2 × contentHeight` and
      `contentHeight < 420` → `strip`; otherwise `ring`)
    - `TimerRingProps.size?: number | 'fluid'`; the warning arc and chip transition on
      `duration-slow`; the `task` slot clamped to two lines and whole in the accessible name
    - `TimerStripProps { remaining?: string; remainingLabel?: string; progress?: number; mode?:
      TimerMode; idleLength?: string; task?: string; stacked?: boolean }`. `task` is required in
      the design-first round (not proposed): it is E's intent line (spec, "E's intent line") and
      `FullScreenFocus` passes it in strip layout (T5). Clamped to two lines, whole in the
      accessible name.
    - `StartButtonProps` gains `unavailable?: boolean`, `compactLabel?: string`,
      `singleKeys?: boolean` (when omitted, no `aria-keyshortcuts`, per planner decision 11's ruling); `finishTime` and
      `disabled` stay, marked `@deprecated`
- Acceptance:
  - [ ] **Design-first, in order:** the artifact implements the fluid ring, the `duration-slow`
    warning fade, `TimerStrip` with `stacked` and `task`, `timerLayout` with its "Choosing the
    layout" README section, and the `StartButton` redesign with `singleKeys` per the ruling
    (planner decision 11: default, no `aria-keyshortcuts`). The README's "Choosing the layout" table gives, per row,
    `contentWidth`, `contentHeight`, `windowWidth` and the expected result, for both Today (boxes
    from the a-timer canvas) and the Focus window (window minus `space-8`, or `space-4` where the
    spec says so). The orchestrator's compatibility check passed before the republish, with its
    output in the issue; refresh byte for byte; the PR links the version.
  - [ ] After the refresh, `pnpm --filter orasenda typecheck` passes against the refreshed
    `index.d.ts` with no app edit (recorded in the PR's Checks).
  - [ ] `TimerRingNextProps` and `StartButtonNextProps` are gone from `index.d.ts`.
  - [ ] `timerLayout` returns the README table's value for every row (its inputs are the
    README's `contentWidth`, `contentHeight` and `windowWidth`, never window sizes), and its
    constants equal `layout-ring-min-height`, `layout-compact-width` and `layout-strip-height` in
    `tokens.json`. The PR lists every row whose result differs from the spec's table.
  - [ ] `TimerStrip`'s `task` is whole in the accessible name with a two-line intent.
  - [ ] Fluid ring: in containers from 160 to 1200px its diameter is clamped to
    [`timer-min-size`, `timer-full-size`] and its digits' computed font size is at least
    `timer-md` (28px).
  - [ ] `TimerStrip` and its stacked form fit at 360, 640 and 1440 wide with a two-line intent in
    the `task` slot, in `focus`, `paused`, `idle`, `break` and `warning`.
  - [ ] `StartButton` at 399px of content shows "Start" and at 400px "Start focus"; its name is
    "Start focus" in both; `aria-keyshortcuts` is `Space Meta+Enter` with `singleKeys` true and
    `Meta+Enter` with it false; with the prop omitted (as `Today.tsx` passes it) the button has
    no `aria-keyshortcuts` (planner decision 11's ruling); the play glyph is `aria-hidden`; `unavailable` keeps it focusable and
    names why through the host's status line (README).
  - [ ] **Compatibility:** with Today's props, `TimerRing` renders its numeric size as before and
    `StartButton` with `finishTime` still renders "Realistic finish · <time>";
    `Today.test.tsx` and `App.test.tsx` pass unchanged.
  - [ ] Harness, contrast, both themes, screenshots and review (timer-surfaces canvas: Today,
    Focus window, break and warning) as in "Every task closes with".
  - [ ] `./scripts/ci.sh` passes; required checks and `windows (advisory)` green.
- Tests first:
  - `timerLayout.test.tsx`: `timer_layout_matches_spec_table` (inputs and expected values are
    the README's "Choosing the layout" rows, Today and Focus window),
    `timer_layout_constants_match_tokens_json`, `timer_layout_boundaries` (height exactly 360,
    width exactly twice the height, height exactly 420, window exactly 640)
  - `timerRing.test.tsx`: `timer_ring_fluid_uses_container_sizing`,
    `timer_ring_numeric_size_unchanged`, `timer_ring_task_whole_in_accessible_name`,
    `timer_ring_every_mode_has_word_or_shape` (incl. `break`, `warning`)
  - `timerStrip.test.tsx`: `timer_strip_name_has_remaining_label_and_mode`,
    `timer_strip_stacked_form`, `timer_strip_idle_shows_idle_length`,
    `timer_strip_every_mode_has_word_or_shape`, `timer_strip_adds_no_live_region`,
    `timer_strip_task_whole_in_accessible_name`
  - `startButton.test.tsx`: `start_button_name_stays_start_focus_with_compact_label`,
    `start_button_keyshortcuts_follow_single_keys`,
    `start_button_without_single_keys_prop_matches_current_output`,
    `start_button_unavailable_stays_focusable`,
    `start_button_finish_time_still_renders_realistic_finish`,
    `start_button_disabled_still_disables`, `start_button_play_glyph_hidden`
  - harness: `fluid_ring_diameter_clamped_in_160_to_1200_containers`,
    `fluid_ring_digits_at_least_timer_md`, `timer_strip_fits_at_360_640_1440_with_two_line_intent`,
    `stacked_strip_fits_at_360`, `start_button_label_switches_at_400px_content`,
    `warning_fade_uses_duration_slow`, `timer_faces_aria_snapshot`,
    `timer_faces_no_motion_when_reduced`
- Notes: `timerLayout` is pure and called on resize only, never on a tick. The compact Start label
  is a container query; jsdom can't see it, so the 399/400 case is a harness case and the jsdom
  test checks only that the name stays "Start focus". `App.test.tsx:122` uses
  `toHaveTextContent("Start focus")`, a substring match, so a hidden compact label in the DOM
  doesn't break it; keep the full label in the DOM. Time strings arrive formatted (ADR-011).

### T4: The preset popover (#171)
- Priority: 1
- Kind: design-system (orchestrator-first)
- Depends on: T2 (runs after T3 merges: planner decision 1)
- Owns:
  - `design/system/**` (refresh: `bundle.js`, `bundle.css`, `index.d.ts`, `design-system.json`,
    `components/PopoverMenu/{README.md,preview.html}`)
  - `packages/ui/index.ts` (adds `PopoverMenu`), `components.{css,d.ts}` (regen),
    `index.test.tsx`, `packages/ui/popoverMenu.test.tsx`
  - `packages/ui/specimens/PopoverMenu.tsx`, `registry.ts`
  - `verification/layout/popoverMenu.spec.ts`; `support/**` (additive)
  - `verification/contrast-pairs.json` (append: rows, check marks, read-only rows, both themes)
- Touches (read-only or additive): `docs/specs/2026-11-10-p1-components.md` (ticks the T4 line);
  GitHub #61 (one line: `PopoverMenu` placement inside an open dialog on the macOS 13 WebKit);
  `apps/orasenda/src/**` (read)
- Interfaces:
  - Consumes: the positioned-panel helper (T2, inside `bundle.js`), `IconButton`
    `aria-haspopup="menu"` (T2), `describeShortcut` (T2)
  - Produces: `PopoverMenuProps { heading: string; description?: string; items:
    PopoverMenuItem[]; readOnly?: boolean; onSelect: (id: string) => void; onClose: () => void;
    id?: string; anchor: React.RefObject<HTMLElement | null>; singleKeys?: boolean }` (`id`,
    `anchor` and `singleKeys` proposed). `PopoverMenu` reads `anchor` only to place itself and
    return focus; it never writes the trigger's attributes. The host sets the trigger's
    `aria-expanded` (from `open`) and `aria-controls` (the menu's `id`), through T2's
    `IconButton` pass-through or on its own summary element (planner decision 10). `singleKeys`:
    the T4 artifact round states its effect in the README; proposed: when `true`, the menu's
    README tells the host to add `P` to the trigger's `aria-keyshortcuts`, and the menu shows
    `P` as a `Kbd` in its heading row; when not `true`, neither appears. `PopoverMenuItem`
    unchanged. The Focus-window form is the host passing
    items without the Settings link row and the Focus-window heading and line.
- Acceptance:
  - [ ] **Design-first, in order:** the artifact implements `PopoverMenu` as a positioned panel
    (not the popover API) anchored to its trigger, with a settable `id`; its README says the
    host sets the trigger's `aria-expanded` and `aria-controls` (planner decision 10) and states
    what `singleKeys` does; refresh byte for byte; the PR links the version.
  - [ ] Radio, checkbox and link rows; ↑/↓ move; Return or Space chooses and closes; Esc closes
    and returns focus to the trigger. In the specimen, the host trigger (an `IconButton` with
    `aria-haspopup="menu"`) sets `aria-expanded` from `open` and `aria-controls` to the menu's
    `id`, and that id resolves to the open menu.
  - [ ] `singleKeys` does exactly what the README states (proposed: `P` appears only when
    `true`), and nothing when omitted.
  - [ ] Read-only form: the current radio checked, the others `aria-disabled`, the Settings row
    still live, the line "Presets can change between sessions.".
  - [ ] Fits at 360 wide; rows are at least `hit-min`; inside an open `Dialog` the menu is
    visible above it and placed against its trigger; near a viewport edge it flips inside.
  - [ ] No live region.
  - [ ] Harness, contrast, both themes, screenshots and review (timer-surfaces canvas: the preset
    summary on Today and in the Focus window) as in "Every task closes with".
  - [ ] `./scripts/ci.sh` passes; required checks and `windows (advisory)` green.
- Tests first:
  - `popoverMenu.test.tsx`:
    `popover_menu_host_trigger_expanded_and_controls_point_at_menu_id`,
    `popover_menu_single_keys_controls_p_shortcut`,
    `popover_menu_id_settable`, `popover_menu_arrows_move_and_return_selects`,
    `popover_menu_space_chooses_checkbox`, `popover_menu_esc_closes_and_returns_focus_to_trigger`,
    `popover_menu_read_only_marks_radios_aria_disabled`,
    `popover_menu_focus_window_form_has_no_settings_row`, `popover_menu_renders_inside_open_dialog`,
    `popover_menu_adds_no_live_region`
  - harness: `popover_menu_fits_at_360`, `popover_menu_rows_meet_hit_min`,
    `popover_menu_keyboard_path`, `popover_menu_placed_against_trigger_inside_open_dialog`,
    `popover_menu_flips_inside_viewport`, `popover_menu_aria_snapshot`,
    `popover_menu_no_motion_when_reduced`
- Notes: the P key that opens the menu on Today is the host's (C) when `singleKeys` is on; the
  component never listens for it. Don't hold the roving index anywhere but component state.

### T5: Focus window and floater (#172)
- Priority: 1
- Kind: design-system (orchestrator-first)
- Depends on: T3, T4
- Owns:
  - `design/system/**` (refresh: `bundle.js`, `bundle.css`, `index.d.ts` with
    `FullScreenFocusNextProps` folded and deleted, `design-system.json`,
    `components/{FullScreenFocus,FloatingTimer}/{README.md,preview.html}`)
  - `packages/ui/index.ts` (adds `FloatingTimer`), `components.{css,d.ts}` (regen),
    `index.test.tsx`, `packages/ui/{fullScreenFocus,floatingTimer}.test.tsx`
  - `packages/ui/specimens/{FullScreenFocus,FloatingTimer}.tsx`, `registry.ts`
  - `verification/layout/{fullScreenFocus,floatingTimer}.spec.ts`; `support/**` (additive)
  - `verification/contrast-pairs.json` (append: the floater's fill and edge over the three
    wallpapers in every state, its controls against its own fill, the full-screen caption)
- Touches (read-only or additive): `docs/specs/2026-11-10-p1-components.md` (ticks the T5 line);
  `apps/orasenda/src/**` (read)
- Interfaces:
  - Consumes: `TimerRing` `size="fluid"`, `TimerStrip`, `timerLayout` (T3); `IconButton`,
    `describeShortcut` (T2); `PopoverMenu` (T4, through the host's `summary`); `Dialog`,
    `MenuBarTimer` (built)
  - Produces:
    - `FullScreenFocusProps` gains `onPause?`, `onResume?`, `onEnd?`, `onStart?` (from
      `FullScreenFocusNextProps`), `summary?: React.ReactNode`, `singleKeys?: boolean`,
      `ended?: boolean`; it measures its own box with a `ResizeObserver` and calls `timerLayout`
    - `FloatingTimerProps extends Omit<MenuBarTimerProps, 'compact'> { onPause?; onResume?;
      onStart?; onOpen?; ended?: boolean }` plus `data-*` attributes passed through to its body
      (`[key: \`data-${string}\`]: string | undefined`, proposed)
    - "Session ended." announced once: the live region the T5 README names (planner decision 8)
- Acceptance:
  - [ ] **Design-first, in order:** the artifact implements both and settles the gaps (`summary`,
    `singleKeys`, `ended`, the floater's "Session ended." announcement, `data-*` pass-through);
    the orchestrator's compatibility check passed before the republish, with its output in the
    issue; refresh byte for byte; the PR links the version.
  - [ ] After the refresh, `pnpm --filter orasenda typecheck` passes against the refreshed
    `index.d.ts` with no app edit (recorded in the PR's Checks).
  - [ ] `FullScreenFocusNextProps` is gone from `index.d.ts`.
  - [ ] E's intent line: every `FullScreenFocus` frame (1280×720, 1920×1080, the strip frame)
    renders a two-line intent in the task slot in `focus`, `paused`, `idle`, `break`, `warning`
    and ended; it fits, and the intent is whole in the accessible name in ring and strip
    layouts (in strip layout `FullScreenFocus` passes it to `TimerStrip`'s `task`, T3).
  - [ ] `FullScreenFocus`: fluid ring or strip from `timerLayout` on its own box, recomputed on
    resize only; the Leave `IconButton` and Esc open the leave `Dialog` with "Stay in full screen"
    as the initial focus; Pause or Resume and End per mode; the idle state with Start; the
    caption follows `singleKeys`; `ended` shows "Session ended.".
  - [ ] `FloatingTimer` fits at 280×56, 280×64 and 360×96 in running, paused, warning, idle,
    ended, deep (1:30:00) and break, over each of the three wallpapers as a plain CSS background;
    its buttons meet `hit-min` at 280×56; its fill is opaque `surface-raised`; no close button;
    `data-tauri-drag-region` passed by the specimen lands on the body.
  - [ ] "Session ended." is announced once, by the one live region its README names; no other
    live region.
  - [ ] `FullScreenFocus` at 1280×720, 1920×1080 and a strip-shaped frame, each in `focus`,
    `paused`, `idle`, `break`, `warning` and ended.
  - [ ] Harness, contrast (fill-or-edge rule over every wallpaper), both themes, screenshots and
    review (timer-surfaces canvas: Focus window, floater, break and warning) as in "Every task
    closes with".
  - [ ] `./scripts/ci.sh` passes; required checks and `windows (advisory)` green.
- Tests first:
  - `fullScreenFocus.test.tsx`: `full_screen_focus_leave_opens_dialog_with_stay_initial_focus`,
    `full_screen_focus_esc_opens_leave_dialog`, `full_screen_focus_controls_per_mode`,
    `full_screen_focus_idle_shows_start`, `full_screen_focus_caption_follows_single_keys`,
    `full_screen_focus_ended_says_session_ended`, `full_screen_focus_renders_host_summary`,
    `full_screen_focus_calls_timer_layout_on_resize_only`,
    `full_screen_focus_task_whole_in_accessible_name_ring_and_strip`
  - `floatingTimer.test.tsx`: `floating_timer_pause_resume_and_open_buttons`,
    `floating_timer_idle_start_named_start_focus`, `floating_timer_passes_data_attributes_to_body`,
    `floating_timer_ended_announced_once`, `floating_timer_deep_shows_hours`,
    `floating_timer_every_mode_has_word_or_shape`
  - harness: `full_screen_focus_ring_at_1280x720_and_1920x1080`,
    `full_screen_focus_strip_in_strip_frame`, `full_screen_focus_two_line_intent_fits_every_frame`,
    `full_screen_focus_keyboard_path`,
    `floating_timer_fits_every_size_and_state`, `floating_timer_buttons_meet_hit_min_at_280x56`,
    `focus_views_aria_snapshot`, `focus_views_no_motion_when_reduced`
- Notes: always-on-top, the window frame and the context menu are D's. The floater never changes
  layout by shape (`layout-strip-height` usage). Re-running `timerLayout` on every `remaining`
  change would make the layout flip on a tick; the `ResizeObserver` callback is the only caller.

### T6: Commands, capture and the shortcut recorder (#173)
- Priority: 1
- Kind: design-system (orchestrator-first)
- Depends on: T2 (runs after T5 merges: planner decision 1)
- Owns:
  - `design/system/**` (refresh: `bundle.js`, `bundle.css`, `index.d.ts` with
    `CommandPaletteNextProps` and `CommandNext` folded and deleted, `design-system.json`,
    `components/{CommandPalette,CapturePad,ShortcutRecorder}/{README.md,preview.html}`)
  - `packages/ui/index.ts` (adds `ShortcutRecorder`), `components.{css,d.ts}` (regen),
    `index.test.tsx`, `packages/ui/{commandPalette,capturePad,shortcutRecorder}.test.tsx`
  - `packages/ui/specimens/{CommandPalette,CapturePad,ShortcutRecorder}.tsx`, `registry.ts`
  - `verification/layout/{commandPalette,capturePad,shortcutRecorder}.spec.ts`; `support/**`
    (additive)
  - `verification/contrast-pairs.json` (append: the shortcut column, the recorder's states and
    conflict line, the pad's helper lines)
- Touches (read-only or additive): `docs/specs/2026-11-10-p1-components.md` (ticks the T6 line);
  `apps/orasenda/src/**` (read)
- Interfaces:
  - Consumes: `Kbd`, `IconButton`, `describeShortcut` (T2); `Dialog` (built)
  - Produces:
    - `Command` gains `shortcut?: string` (canonical glyphs; drawn as a right-aligned `Kbd` with
      `spoken` from `describeShortcut`); `CommandPaletteProps` gains `compact?: boolean` (the host
      sets it below `layout-compact-height`), with a Close `IconButton` in the compact form
    - `CapturePad`: the redesign copy (description, the ⌘↩ helper, the line explaining the chosen
      kind); ⌘↩ saves; its README says the host announces "Saved to Inbox."; no live region
      besides its error line
    - `ShortcutRecorderProps { label: string; keys?: string; spokenKeys?: string; recording?:
      boolean; conflict?: string; onRecord: (keys: string | null) => void; onRestoreDefault?: ()
      => void; id?: string }` (`id` per the README contract); `onRecord` receives a canonical
      glyph string, or `null` for ⌫ (off)
- Acceptance:
  - [ ] **Design-first, in order:** the artifact settles the three gaps (CapturePad's host
    announcement, `compact` as a prop, canonical glyphs from the recorder), adds
    `ShortcutRecorder`'s `id` to `index.d.ts` and its README, and implements the three; the
    orchestrator's compatibility check passed before the republish, with its output in the
    issue; refresh byte for byte; the PR links the version.
  - [ ] After the refresh, `pnpm --filter orasenda typecheck` passes against the refreshed
    `index.d.ts` with no app edit (recorded in the PR's Checks).
  - [ ] `CommandPaletteNextProps` and `CommandNext` are gone from `index.d.ts`.
  - [ ] Palette: the shortcut column is a `Kbd` whose spoken form is in the row's name; the
    compact form fits at 360×240 with a Close `IconButton`; a long label and hint wrap without
    hiding the `Kbd`; rows and Close meet `hit-min`; the command list stays one tab stop.
  - [ ] `CapturePad`: the redesign copy word for word from its README; ⌘↩ saves; the only live
    region is its existing error line.
  - [ ] `ShortcutRecorder`: record, Esc cancels, ⌫ turns off, restore default, the conflict line
    within `panel-width` and linked by `aria-describedby` (not live), the name composed with
    `aria-labelledby`, settable `id`; every key it can emit round-trips through
    `describeShortcut`.
  - [ ] Harness, contrast, both themes, screenshots and review (Settings canvas, Keyboard; the
    onboarding canvas for the capture pad and the welcome tip) as in "Every task closes with".
  - [ ] `./scripts/ci.sh` passes; required checks and `windows (advisory)` green.
- Tests first:
  - `commandPalette.test.tsx`: `command_palette_shortcut_is_kbd_in_row_name`,
    `command_palette_compact_has_close_icon_button`, `command_palette_list_is_one_tab_stop`,
    `command_palette_current_props_unchanged`
  - `capturePad.test.tsx`: `capture_pad_redesign_copy`, `capture_pad_cmd_return_saves`,
    `capture_pad_adds_no_live_region_besides_error`
  - `shortcutRecorder.test.tsx`: `shortcut_recorder_records_canonical_glyphs`,
    `shortcut_recorder_output_round_trips_describe_shortcut`, `shortcut_recorder_esc_cancels`,
    `shortcut_recorder_backspace_turns_off`, `shortcut_recorder_restore_default`,
    `shortcut_recorder_name_composed_with_labelledby`, `shortcut_recorder_id_settable`,
    `shortcut_recorder_conflict_is_described_not_live`,
    `shortcut_recorder_modifier_only_press_records_nothing`
  - harness: `command_palette_compact_fits_360x240`, `long_command_wraps_without_hiding_kbd`,
    `palette_rows_and_close_meet_hit_min`, `shortcut_recorder_conflict_within_panel_width`,
    `shortcut_recorder_keyboard_path`, `commands_and_capture_aria_snapshot`,
    `commands_and_capture_no_motion_when_reduced`
- Notes: the recorder reads `KeyboardEvent.code` and modifiers and emits glyphs in `⌃⌥⇧⌘` order;
  it doesn't decide whether a binding is allowed or in conflict (F's Rust does); the host passes
  `conflict`. Which shortcut is live is F's.

### T7: The icon set and the rail (#174)
- Priority: 1
- Kind: design-system (orchestrator-first; the owner approves the glyph sheet)
- Depends on: T6 (for the series; its real dependencies are T2 and the owner's glyph approval)
- **Before T7 (off-repo, beside T3–T6):** after T2 merges, the orchestrator asks Claude to draw
  the glyphs on a separate draft canvas artifact: Lucide's geometry (ISC) redrawn to the 20px
  grid, 1.5 stroke, round caps and joins, matching the rail's line icons. The owner reviews it
  while T3–T6 run. T7's republish waits for T6 and uses the approved drawings.
- Owns:
  - `design/system/**` (refresh: `bundle.js`, `bundle.css`, `index.d.ts` with `Icon`,
    `IconProps` and `IconName`, `design-system.json`, the new `components/Icon/{README.md,preview.html}`
    (the glyph sheet in both themes), `components/{NavRail,StartButton,IconButton}/{README.md,preview.html}`
    where the republish changes them, `README.md` (the "Icon set" line))
  - `packages/ui/index.ts` (adds `Icon`, type `IconName`), `components.{css,d.ts}` (regen),
    `index.test.tsx` (exports; the final `*NextProps` check), `packages/ui/{icon,navRail}.test.tsx`,
    `packages/ui/startButton.test.tsx` (the glyph case)
  - `packages/ui/specimens/{Icon,NavRail}.tsx`, `registry.ts`, and every earlier specimen
    (placeholder glyphs → `Icon`)
  - `verification/layout/{icon,navRail}.spec.ts`; `support/**` (additive)
  - `verification/contrast-pairs.json` (append: glyphs on every surface they sit on, rail
    current and rest)
- Touches (read-only or additive): `docs/specs/2026-11-10-p1-components.md` (ticks the T7 line;
  the VoiceOver boxes and the spec's status stay for the close-out PR, planner decision 7);
  GitHub #149 (a comment adding Lucide's ISC notice); `apps/orasenda/src/App.tsx` and
  `App.test.tsx` (read: the rail must pass unchanged)
- Interfaces:
  - Consumes: `IconButton` (T2), `StartButton` (T3), the approved glyph drawings
  - Produces: `type IconName = 'play' | 'pause' | 'stop' | 'expand' | 'collapse' | 'window' |
    'menu' | 'chevron' | 'close' | 'back' | 'alert' | 'info' | <the six rail names>` (the rail
    names are the artifact's; proposed `'today' | 'board' | 'calendar' | 'routines' | 'review' |
    'settings'`, the `NavPage` values); `interface IconProps { name: IconName }`; `declare function
    Icon(props: IconProps): React.ReactElement` (a 20×20 `svg`, `aria-hidden="true"`, stroke
    1.5, round caps and joins, `currentColor`); `NavRail` with one roving tab stop (↑/↓,
    Return/Space) and the final icons; `StartButton`'s play glyph from `Icon`
- Acceptance:
  - [ ] The owner approved the glyph sheet in the artifact preview before merge; the approval
    is linked in the PR.
  - [ ] **Design-first, in order:** the artifact adds `Icon` and its README and preview card,
    `IconName` and `IconProps` in `index.d.ts`, `NavRail` roving focus with the final icons,
    `StartButton` on `Icon`; refresh byte for byte; the PR links the version.
  - [ ] `index.d.ts` declares exactly six `*NextProps`: `TaskCard`, `RoutineItem`,
    `IntentPrompt`, `Dialog`, `KanbanColumn`, `NowLine` (spec, Goal 2); no P1 component is
    marked "Not implemented in bundle.js yet".
  - [ ] Every `IconName` renders an `aria-hidden` 20px glyph; the glyph sheet fits at 20px in
    both themes.
  - [ ] The rail is one tab stop: ↑/↓ move, Return or Space navigates, Tab leaves; items stay
    `button`s named by their labels with `aria-current="page"` on the current one;
    `App.test.tsx` passes unchanged.
  - [ ] Every specimen uses `Icon`; no placeholder glyph is left in `packages/ui/specimens/` or
    in `bundle.js`.
  - [ ] #149 has Lucide's notice. The spec's T7 line is ticked.
  - [ ] Harness, contrast, both themes, screenshots and review (timer-surfaces canvas for the
    glyphs; Settings canvas for the rail) as in "Every task closes with".
  - [ ] `./scripts/ci.sh` passes; required checks and `windows (advisory)` green.
- Tests first:
  - `icon.test.tsx`: `icon_every_name_renders_aria_hidden_svg`,
    `icon_name_union_matches_runtime_table`, `icon_uses_20px_grid_and_1_5_stroke`
  - `navRail.test.tsx`: `nav_rail_is_one_roving_tab_stop`,
    `nav_rail_arrows_move_and_return_navigates`, `nav_rail_keeps_aria_current_page`,
    `nav_rail_tab_stop_follows_current_page`
  - `startButton.test.tsx`: `start_button_play_glyph_from_icon`
  - `index.test.tsx`: `index_d_ts_declares_only_later_phase_next_props`,
    `no_p1_component_marked_not_implemented`
  - harness: `glyph_sheet_at_20px_both_themes`, `rail_roving_focus_one_tab_stop`,
    `icons_and_rail_aria_snapshot`, `icons_and_rail_no_motion_when_reduced`
- Notes: the role glyphs are P5's and stay out of `IconName`. `IconName` is a closed union: an
  unknown name is a type error, and the runtime table and the union are checked equal by
  `icon_name_union_matches_runtime_table` (read from `components.d.ts`).

## Coverage check
| Spec requirement | Task(s) |
|---|---|
| Goal 1: `window.Orasenda` and `@orasenda/ui` export the eight components and two functions; the exports test lists them | T2, T3, T4, T5, T6, T7 (`exports_every_namespace_member`, extended per task) |
| Goal 2: the redesign props move onto `*Props`; exactly six `*NextProps` left | T3, T5, T6 (folds), T7 (`index_d_ts_declares_only_later_phase_next_props`) |
| Goal 3 (a): jsdom tests per component | T2–T7 (Tests first) |
| Goal 3 (b): a specimen per component with every README state, plus `break` and `warning` for timers, in both themes | T1 (specimen server, `Frame`), T2–T7 (specimens), T3 and T5 (`break`, `warning`) |
| Goal 3 (c): WebKit layout, hit targets, keyboard, reduced motion, accessibility tree | T1 (helpers, `seed.spec.ts`), T2–T7 (spec files) |
| Goal 3 (d): colour pairs in `contrast-pairs.json` passing in both themes | T1 (script, seed pairs), T2–T7 (append) |
| Goal 3 (e): the owner's VoiceOver pass per component, under "Not yet verified" | T2–T7 (PR lists it), close-out docs PR (ticks; planner decision 7) |
| Goal 4: `contrast.py` on every platform, `layout` on macOS; seeded failures; CI installs and caches WebKit; Python on both jobs | T1 (`seeded_overflow_is_reported`, `test_seeded_text_pair_under_4_5_fails`, `test_floater_fails_when_fill_and_edge_both_under_3`, `ci.yml`) |
| Goal 5: bundled fonts, OFL texts, `@font-face` from `type.fonts`, `document.fonts.check` and no CDN request | T1 (`emits_font_face_per_type_fonts_entry`, `bundled_fonts_loaded_for_every_family_and_weight`, `no_request_leaves_the_specimen_server`) |
| Goal 6: the app keeps working with no app edits; `finishTime` and numeric `size` render as before | every task (typecheck and test), T3 (`start_button_finish_time_still_renders_realistic_finish`, `timer_ring_numeric_size_unchanged`), T7 (`App.test.tsx` unchanged) |
| Goal 7: ROADMAP places Components between B and C, C–G cells, dated #134 note | merged with the spec (#166); nothing owed |
| `CONTEXT.md` terms Specimen and First-consumer check | merged with the spec (#166); nothing owed |
| Key table: `describeShortcut`, round trip, unknown key strict and lenient | T2 (`describe_shortcut_*`), T6 (`shortcut_recorder_output_round_trips_describe_shortcut`) |
| `timerLayout` rule and table; constants equal tokens; resize only | T3 (`timer_layout_matches_spec_table`, `timer_layout_constants_match_tokens_json`), T5 (`full_screen_focus_calls_timer_layout_on_resize_only`) |
| Engine baseline: positioned panels, inside the nearest open dialog; #61 lines | T2 (`tooltip_visible_above_open_dialog`), T4 (`popover_menu_placed_against_trigger_inside_open_dialog`) |
| Contract gaps per task, settled in the artifact first and recorded in the PR | T1–T7 (first acceptance item each) |
| Copy and colour guard (no "!", no emoji, `critical` only in two places) | T1 (`guard.test.ts`), every later task (it scans the whole `bundle.js`) |
| No live region unless the README names one; ids settable | T2 (`tooltip_adds_no_live_region`, `icon_button_id_passes_through`), T3 (`timer_strip_adds_no_live_region`), T4 (`popover_menu_id_settable`, `popover_menu_adds_no_live_region`), T5 (`floating_timer_ended_announced_once`), T6 (`capture_pad_adds_no_live_region_besides_error`, `shortcut_recorder_id_settable`, `shortcut_recorder_conflict_is_described_not_live`) |
| Components never read a setting; `singleKeys` from the host | T3 (`start_button_keyshortcuts_follow_single_keys`, `start_button_without_single_keys_prop_matches_current_output`), T5 (`full_screen_focus_caption_follows_single_keys`), T4 (`popover_menu_single_keys_controls_p_shortcut`) |
| Menu trigger's `aria-expanded` and `aria-controls` (set by the host) | T2 (`icon_button_expanded_and_controls_pass_through`), T4 (`popover_menu_host_trigger_expanded_and_controls_point_at_menu_id`) |
| E's intent line: two-line intent in the `task` slot of ring, strip and full screen | T3 (`timer_ring_task_whole_in_accessible_name`, `timer_strip_task_whole_in_accessible_name`, `timer_strip_fits_at_360_640_1440_with_two_line_intent`), T5 (`full_screen_focus_task_whole_in_accessible_name_ring_and_strip`, `full_screen_focus_two_line_intent_fits_every_frame`) |
| Playwright has no WebKit for the host's macOS: stop and ask | T1 (checkpoint 1: the draft PR's log shows the WebKit launch line; the owner's macOS 27 comment) |
| Three visible changes: fonts (T1 manual Settings check), rail (T7), warning fade (T3) | T1 (manual, four screenshots), T7 (`nav_rail_is_one_roving_tab_stop`), T3 (`warning_fade_uses_duration_slow`) |
| Missing WebKit offline fails with the install command; never skips on macOS | T1 (acceptance, checked by hand) |
| Flaky harness: `retries: 1` in CI with trace, `0` locally | T1 (`playwright.config.ts`) |
| Licence notices: three OFL fonts, Lucide ISC | T1 (#149 comment), T7 (#149 comment) |
| Failure mode: a family missing from `@font-face` still passes `document.fonts.check` | T1: `bundled_fonts_loaded_for_every_family_and_weight` |
| Failure mode: a content box exactly at a `timerLayout` threshold | T3: `timer_layout_boundaries` |
| Failure mode: a Tooltip shown when focus is restored by script after a dialog closes | T2: `tooltip_not_shown_on_programmatic_focus` |
| Failure mode: a menu opened near the window edge is placed outside the viewport | T4: `popover_menu_flips_inside_viewport` |
| Failure mode: a modifier pressed alone while recording emits a binding | T6: `shortcut_recorder_modifier_only_press_records_nothing` |

Self-review: every Goal, inventory row marked "to build" or with a `*NextProps`, contract gap and
Behavior bullet maps to a task; every task has acceptance criteria and named tests; each named
test belongs to one task; the tasks run in series, so no two run at once, and the ownership table
names every shared file; the graph has no cycle. The off-repo glyph canvas edits no repo file.
