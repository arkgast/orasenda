# Structure refactor and legacy removal

- Date: 2026-11-10
- Status: approved (owner, 2026-11-10: the folder structure shown in the session, the 500-line ceiling, "use workflow to execute this")
- Plan: [docs/plans/2026-11-10-structure-refactor.md](../plans/2026-11-10-structure-refactor.md)
- Runs before sub-project C (Today redesign). C's decisions so far (design-match check: WebKit layout cases plus a review checklist; DevPanel: its own debug-only window) stand.

## Why
1. **Files grew without structure.** `apps/orasenda/src-tauri/src/session.rs` is 3,789 lines (≈1,020 production, 85 tests); `tray.rs` 998, `spike/commands.rs` 963, `scheduler.rs` 839, `crates/store/src/lib.rs` 781, `core/timer/engine.rs` 750. The frontend `src/` is flat. Cause: a task's Owns made "add to my file" the cheapest path, and no review or CI check looked at module shape. Upstream report: JCIOriente/baton#136.
2. **The use cases live in the UI adapter.** `SessionService` (start, pause, record, recover, settings) sits in the Tauri crate, tied to it only by `setup()`, `run_action()`, the IPC types in `ipc.rs` and the `Host` in `scheduler.rs`. A second adapter (a future MCP server so Claude can create tasks, a CLI) could not reuse it.
3. **The legacy bundle is still there.** Every component is TSX, but `packages/ui/src/legacy.{js,d.ts,css}` remain: `legacy.d.ts` still supplies `Mode`, `TimerMode`, `FieldProps` and `Command` to `types.ts`; `legacy.css` (41 px literals) is imported by `styles.css` and still styles the app's `os-num`, `os-actions`, `os-sr-only`; the build carries legacy branches; Preflight stays off because of it. `Choice` is still CSS classes on native markup.

## Goals
- Every source file ≤ **500 lines, tests included**, enforced in CI.
- A layered workspace with a UI-free use-case crate, so adapters stay thin.
- Feature folders in the app frontend.
- No legacy code: `legacy.*` deleted, `Choice` a TSX component, Preflight on.
- **No behaviour change.** Every task moves code or changes it, never both; the existing tests are the proof.

## Non-goals
- **No multi-database support.** The store may one day sit on a remote database (Postgres, Firestore) beside SQLite; this refactor only keeps that possible (rule 4 below) and writes no code for it.
- No MCP server, no CLI. Only the seam (`crates/service`).
- No Today layout work (C), no new design-system component other than `Choice`'s migration.
- VoiceOver passes are deferred to the end of P1 (owner, 2026-11-10); reviews still check names and roles in code.

## Target structure

```
crates/
  core/        pure domain (no I/O, no target_os), unchanged role
    src/timer/{mod,engine,format}.rs, src/timer/engine/tests.rs
    src/{blocking,usage,clock,platform,app_info}.rs (+ tests.rs where a file would pass 500)
  store/       the only SQLite user, unchanged role
    src/lib.rs (re-exports only), src/{db,error,txn,migrate,hooks}.rs
    src/repo/{settings,focus_sessions,active_session,meta}.rs
  service/     NEW orasenda-service: use cases, never depends on tauri, tao or wry
    src/lib.rs
    src/api/{timer,settings,errors,events}.rs        today's ipc.rs (specta types; bindings.ts unchanged)
    src/session/{mod,service,actions,recovery,persist,settings,view,effects}.rs
    src/session/tests/{support,actions,recovery,settings,notifications}.rs
    src/scheduler/{mod,host}.rs + tests              tick and publish logic behind Host
  platform-macos/  unchanged
apps/
  orasenda/src-tauri/src/   the Tauri adapter only
    main.rs, lib.rs (builder and wiring)
    commands/{mod,timer,settings,notifications,navigation}.rs
    runtime/{ticker,events}.rs                       the thread and the Host impl, event emits
    tray/{mod,menu,render,state}.rs + tray/icons/
    menu/app_menu.rs
    {lifecycle,notifications,platform}.rs
    spike/{mod,state,macos}.rs, spike/commands/{mod,rules,usage,overlay}.rs
    (windows/ arrives with C's DevPanel window and D's Focus and floater windows)
  orasenda/src/
    main.tsx
    app/{App,PageBoundary,routes,useTheme}             the shell
    ipc/{bindings.ts (generated), subscribe,timerQueue,settingsQueue}
    features/timer/{useTimer,useClock,format}
    features/today/{Today.tsx, Today.*.test.tsx}
    features/settings/{Settings.tsx, sections/*, customRange, notificationsToggle}
    dev/{DevPanel, Overlay, useSpike, …}                spike-only
    styles/app.css
    test/fixtures.ts                                 today's pages/testing.ts
  orasenda-mcp/   FUTURE, not built here
packages/ui/src/components/ui/choice.tsx             NEW (migrated); legacy.* deleted
```

## Rules (go into `docs/conventions.md` in R0)
1. **Size.** A tracked source file (`.rs`, `.ts`, `.tsx`, `.js`, `.css`) is at most 500 lines, tests included. Generated files are exempt (`apps/orasenda/src/bindings.ts`, `packages/tokens/{tokens,theme}.css`, `dist/`, `gen/`). Today's offenders sit in `scripts/file-size-allowlist.txt` with their current line count; the guard fails when a listed file grows past its count, when a listed file is back under 500 (stale entry: remove it), or when an unlisted file passes 500. The list only shrinks.
2. **Layering.** `core` has no I/O. `store` is the only crate with SQLite. `service` never depends on `tauri`, `tao` or `wry` (`just service-boundary`, like `core-boundary`). Adapters hold no business rules: a command parses, calls the service, and maps the result.
3. **Folders.** A Rust module becomes a folder (`foo/mod.rs`) once it has more than one part. Rust tests live in `tests.rs` or `tests/` beside their module (`#[cfg(test)] mod tests;`), with shared fixtures in one `support` module. Frontend code lives by feature; tests sit beside their file and split by behaviour.
4. **The store hides its driver.** No `rusqlite` type appears in the store's public API or in `service`. Repositories take the store's own `Txn`. Write new store code so another backend could sit behind the same API; don't build that backend.
5. **A refactor PR moves code or changes it, never both.** A move keeps public paths working with re-exports until every caller is updated in the same PR.
6. **Plans split before they grow.** A task that would push a file past 500 lines includes the split, and its Owns lists the new sibling files.

## Legacy removal and Choice
- **Choice.** `packages/ui/src/components/ui/choice.tsx` exports `ChoiceGroup` and `Choice` (+ props types), built on native `<input type="radio|checkbox">` inside a `<label>` in a `<fieldset>` with a `<legend>` (or `role="radiogroup"` with `aria-labelledby`, as Settings › Timer does today), keeping form semantics, the `choice.md` states (checked ground `selection`, focus dot, dashed disabled, segmented and long variants) and `hit-min`. Theme utilities only, no arbitrary values; the `1.5px` border follows the wave-1 ruling (`border-2`). The CSS block in `styles.css` goes. Consumers: Settings › Timer, Today's preset radios (C removes them later) and the DevPanel. Component test, WebKit specimen in both themes, README updated.
- **Legacy.** `Mode`, `TimerMode`, `FieldProps` and `Command` move into `types.ts` (or onto their components). `os-num` → `font-mono tabular-nums` utilities, `os-sr-only` → `sr-only`, `os-actions` → utilities. `legacy.js`, `legacy.d.ts`, `legacy.css` are deleted with every build and test branch that reads them (`vite.config.ts` `legacyExternalForDts`/`hasMigratedExports`, `design-system/build.ts` `composeDeclarations`, `guard.test.ts`, `libraryBuild.test.ts`, `index.test.tsx`, comments in `lib/layer.ts` and `tooltip.tsx`). `guard.test.ts` then fails if a file named `legacy.*` or an `os-` class reappears in `packages/ui/src`.
- **Preflight.** `styles.css` imports Tailwind's preflight in the base layer; `app.css` and the specimens are adjusted so the app looks the same. Before/after WebKit screenshots of Today, Settings and every specimen, in both themes, go on the PR.

## The service crate
- `crates/service` (package `orasenda-service`) depends on `orasenda-core`, `orasenda-store`, `serde`, `specta`, `uuid`. It holds `SessionService`, `Platform`, `Action`, `Effects`, the `api` types and the scheduler's tick/publish logic behind a `Host` trait.
- The Tauri crate keeps `setup`, `run_action` (`tauri::App`/`AppHandle` glue), the ticker thread, event emits, the specta builder and `bindings.ts` export. `bindings.ts` must come out byte-identical (CI already diffs it).
- `just service-boundary` fails if `orasenda-service` depends on `tauri`, `tao` or `wry`; `just mobile` checks it for iOS and Android like core and store.
- `SystemTime::now()` stays out of `service` too (time is passed in), so it is testable like core.

## Testing strategy
- No new behaviour, so no new behaviour tests, except: the size guard's own test (`scripts/file-size.test.sh`, fixtures for grew / stale / new offender / generated exempt), `Choice`'s component test and specimen, the guard test that legacy can't return, and the `service-boundary` check.
- Every move keeps every existing test, renamed paths only. Test counts before and after go in each PR's Checks (`cargo test` and vitest totals must match).
- `./scripts/ci.sh` in full for every task, under the shared lock.

## Acceptance
- [ ] `just file-size` is in `ci`; the allowlist holds only `Today.test.tsx` (C rewrites it) or is empty.
- [ ] `crates/service` exists, the Tauri crate has no `SessionService`, `just service-boundary` passes.
- [ ] The tree matches "Target structure" (folders that would hold nothing yet are not created).
- [ ] No `legacy.*` file, no `os-` class in `packages/ui/src` or the app, Preflight on, `Choice` is TSX.
- [ ] `bindings.ts` unchanged; test totals unchanged except the added tests.
- [ ] `docs/conventions.md` has the rules above; ROADMAP notes this refactor before C.
