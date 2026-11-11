# Structure refactor and legacy removal — Implementation Plan

- Spec: [docs/specs/2026-11-10-structure-refactor.md](../specs/2026-11-10-structure-refactor.md) (approved 2026-11-10)
- Date: 2026-11-10
- Status: implemented (2026-11-11; backlog 2026-11-10; R0 #268, R1 #269, R2 #270, R3 #271, R4 #272, R5 #278, R6 #273, R7 #274, R8 #275, R9 #276, R10 #277)

## Overview
Eleven tasks in two lanes that share no files until the end. **Frontend lane:** R1 Choice → R2 legacy removal → R3 Preflight. **Rust lane:** R0 guard → R4–R7 splits in place → R8 service crate → R9 adapter folders. **Last:** R10 frontend folders (it moves `bindings.ts`, whose path R8/R9's `lib.rs` sets). One PR per task, one Workflow pipeline per task, at most three at once.

Models: sonnet implements, tests first; opus reviews every task (each review checks "moved, not changed" against the base commit); one fix round, then a scoped re-review. The controller verifies, merges and resolves rebase conflicts.

Merge rule (owner, 2026-11-10): rebase on origin/main, run biome, typecheck and vitest, then a green local `baton verify` under the lock (`CARGO_TARGET_DIR=.worktrees/.cargo-target`), then `gh pr merge --squash --admin --match-head-commit <HEAD>`. No wait on GitHub CI.

## Move discipline (every task)
- A move commit contains only moves and the import/`mod`/`use` edits they force. If a split needs a visibility change (`pub(crate)`, `pub(super)`), it is the smallest that compiles, named in the PR.
- `git mv` the original to its largest successor first, so history follows.
- Checks list the test totals before and after (`cargo test --workspace` summary lines, vitest totals). They must match.
- Each task removes its files from `scripts/file-size-allowlist.txt` (one line per file, so parallel edits rebase cleanly).

## Dependency graph
```
R0 ──> R4 session split ─┐
   ├─> R5 tray split ────┼─> R8 service crate ──> R9 adapter folders ─┐
   ├─> R6 spike split ───┘                                            ├─> R10 frontend folders
   └─> R7 store + core splits                                        │
R1 Choice ──> R2 legacy removal ──> R3 Preflight ─────────────────────┘
```
Start immediately: R0 and R1. R1 doesn't need R0 (it touches no allowlisted file).

## File ownership
| File | Owner | Others may |
|---|---|---|
| `scripts/file-size-allowlist.txt` | R0 | each split task deletes its own lines |
| `justfile` | R0 (`file-size` recipe and its `ci` line) | R8 adds `service-boundary` and the `mobile` line for service |
| `docs/conventions.md` | R0 | none |
| `packages/ui/src/styles.css` | R1 (Choice block) | R2 (legacy import), R3 (preflight) |
| `Cargo.toml` (workspace members) | R8 | none (`crates/*` already matches) |
| `apps/orasenda/src-tauri/src/lib.rs` | R8 | R9 (`mod` lines), R10 (bindings path) |

## Tasks

### R0: Structure rules and the size guard
- Kind: tooling + docs. Priority 1.
- Owns: `scripts/file-size.sh`, `scripts/file-size.test.sh`, `scripts/file-size-allowlist.txt`, `justfile` (`file-size` recipe, one line in `ci` after biome), `docs/conventions.md` (new "Code structure and size" section with spec rules 1–6).
- Touches: `docs/ROADMAP.md` (one note: this refactor runs before C), `docs/specs/2026-11-10-structure-refactor.md` (status line only, at the end of R10 — not here).
- Allowlist at start (path, current lines): session.rs 3789, Today.test.tsx 1039, tray.rs 998, spike/commands.rs 963, scheduler.rs 839, store/src/lib.rs 781, core/timer/engine.rs 750, Settings.test.tsx 629, core/blocking.rs 511, spike/state.rs 511. Exempt: generated files and `design/reviews/`.
- Tests first: `file-size.test.sh` with temp fixtures: new offender fails, listed file grown fails, listed file under 500 fails as stale, generated path exempt, clean tree passes.

### R1: Choice in TSX
- Kind: design-system component. Priority 1.
- Owns: `packages/ui/src/components/ui/choice.{tsx,test.tsx,md,specimen.tsx}`, `packages/ui/src/index.ts` (export lines), `packages/ui/src/styles.css` (delete the Choice block), `packages/ui/specimens/registry.ts`, `verification/layout/choice.spec.ts`, `verification/contrast-pairs.json` (if it lists Choice).
- Touches: `apps/orasenda/src/pages/settings/Timer.tsx`, `apps/orasenda/src/pages/Today.tsx` (preset radios only), `apps/orasenda/src/spike/DevPanel.tsx`, their tests (selectors only), `packages/ui/index.test.tsx` (expected names).
- Tests first: `choice.test.tsx` (radio group name, checked state word/ground, disabled reason, keyboard arrows move within a radio group natively, checkbox), the WebKit spec (hit-min 44, focus ring visible, both themes). Existing Settings/Today/DevPanel tests must pass unchanged except selectors.

### R2: Delete legacy
- Kind: design-system cleanup. Priority 1. Depends on R1.
- Owns: `packages/ui/src/legacy.{js,d.ts,css}` (delete), `packages/ui/src/types.ts`, `packages/ui/src/styles.css` (legacy import), `packages/ui/vite.config.ts`, `packages/ui/design-system/build.ts`, `packages/ui/guard.test.ts`, `packages/ui/libraryBuild.test.ts`, `packages/ui/index.test.tsx`, `packages/ui/src/lib/layer.ts` and `tooltip.tsx` (comments), `packages/ui/.build/seed/index.ts` if it reads legacy.
- Touches: app files using `os-num`, `os-actions`, `os-sr-only` (Today.tsx, Settings.tsx, App.tsx) and `apps/orasenda/src/styles/app.css` rules for them; their tests (selectors only); `CLAUDE.md` (drop the "while the migration runs … legacy.js" lines); `packages/ui/design-system/README.md` (the `os-` prefix line).
- Tests first: `guard.test.ts` fails on any `legacy.*` file or `os-` class under `packages/ui/src` and the app (except `spike/` CSS files, which are named in the test if they still use plain classes — check).
- Also: `just ui-build` and `just design-system-check` must pass with the legacy branches gone; the published artifact is republished by the controller after merge (`just design-system`, publish with `"editing": "code"`).

### R3: Preflight on
- Kind: design-system. Priority 2. Depends on R2.
- Owns: `packages/ui/src/styles.css`, `apps/orasenda/src/styles/app.css`, `packages/ui/specimens/specimens.css`, `apps/orasenda/src/spike/{spike,overlay}.css` (only rules Preflight breaks).
- Touches: none in components unless a specimen screenshot shows a visible change (then name it and fix it in the component, within its file).
- Proof: WebKit screenshots before and after (Today idle, Settings each section, every specimen; light and dark) under the controller's scratchpad, listed in the PR; `just layout` green.

### R4: Split session.rs in place
- Kind: Rust refactor (move only). Priority 1. Depends on R0.
- Owns: `apps/orasenda/src-tauri/src/session.rs` → `session/{mod,service,actions,recovery,persist,settings,view,effects,setup}.rs` and `session/tests/{mod,support,actions,recovery,settings,notifications}.rs` (split the 85 tests by the behaviour they cover; the cfg(test) fakes at L1021 go to `tests/support.rs`), the allowlist line.
- Touches: callers' `use crate::session::…` paths only (`commands.rs`, `scheduler.rs`, `tray.rs`, `lifecycle.rs`, `notifications.rs`, `lib.rs`), unless `session/mod.rs` re-exports keep them unchanged (preferred).
- Every new file ≤ 500 lines. `SessionService`'s impl may be split across files with several `impl SessionService` blocks.

### R5: Split tray.rs
- Kind: Rust refactor. Priority 1. Depends on R0.
- Owns: `tray.rs` → `tray/{mod,menu,render,state}.rs` + `tray/tests.rs` (icons/ already exists), the allowlist line.
- Touches: none (`mod tray;` resolves to `tray/mod.rs`).

### R6: Split the spike
- Kind: Rust refactor. Priority 2. Depends on R0.
- Owns: `spike/commands.rs` → `spike/commands/{mod,rules,usage,overlay}.rs` + tests; `spike/state.rs` tests → `spike/state/tests.rs` (or `state.rs` stays and tests move to `state_tests.rs` via `#[path]` — prefer the folder); the allowlist lines.
- Touches: `lib.rs` only if a command path changes (prefer re-exports so `spike::commands::spike_status` stays).

### R7: Split store and core
- Kind: Rust refactor. Priority 2. Depends on R0.
- Owns: `crates/store/src/lib.rs` → `lib.rs` (re-exports) + `db.rs`, `error.rs` (+ `tests.rs`); move repositories under `src/repo/` with `pub use` keeping `orasenda_store::settings` etc. working; `crates/core/src/timer/engine.rs` tests → `timer/engine/tests.rs`; `crates/core/src/blocking.rs` tests → `blocking/tests.rs`; the allowlist lines.
- Touches: none outside the two crates (public paths kept). Note in the PR any public store item that exposes a `rusqlite` type (spec rule 4); don't change it.

### R8: The service crate
- Kind: Rust refactor (move across crates). Priority 1. Depends on R4, R5, R6.
- Owns: `crates/service/**` (new: `Cargo.toml`, `src/lib.rs`, `src/api/*` from `ipc.rs`, `src/session/*` from R4 minus the Tauri glue, `src/scheduler/*` with the `Host` trait and tick/publish logic from `scheduler.rs`), `apps/orasenda/src-tauri/Cargo.toml` (depend on it), `apps/orasenda/src-tauri/src/{ipc,session,scheduler}.rs` or folders (shrink to glue / re-exports), `justfile` (`service-boundary` recipe in `ci`, service in `mobile`), `Cargo.lock`, the allowlist line for scheduler.rs.
- Touches: every app-crate file whose `use crate::ipc::…`/`crate::session::…` paths change (`commands.rs`, `tray/*`, `lifecycle.rs`, `notifications.rs`, `app_menu.rs`, `spike/*`, `lib.rs`); `docs/conventions.md` is R0's — no edit.
- Rules: `bindings.ts` byte-identical; `crates/service` has no `tauri`/`tao`/`wry` in `cargo tree`; it builds for iOS and Android; `ClockTick` and any other type `service` needs moves into `api`. New dependencies only those the moved code already uses (workspace versions; no baton:deps needed unless a version changes).

### R9: Adapter folders
- Kind: Rust refactor. Priority 2. Depends on R8.
- Owns: `commands.rs` → `commands/{mod,timer,settings,notifications,navigation}.rs`; the Tauri half of the scheduler → `runtime/{mod,ticker,events}.rs`; `app_menu.rs` → `menu/{mod,app_menu}.rs`; `lib.rs` (`mod` lines and the `collect_commands!` paths).
- Touches: none else.

### R10: Frontend feature folders
- Kind: frontend refactor. Priority 2. Depends on R3 and R9.
- Owns: every file under `apps/orasenda/src/` (moves per the spec's tree), `apps/orasenda/src-tauri/src/lib.rs` (`bindings_path` → `../src/ipc/bindings.ts`), `justfile` (the two `bindings.ts` paths in `ci`), `biome.json`/tsconfig/vite/vitest config path entries, `apps/orasenda/index.html` and any other entry pointing at `src/main.tsx` (kept at `src/main.tsx`), `Today.test.tsx` and `Settings.test.tsx` split by behaviour into ≤ 500-line files, the allowlist (should end empty), `docs/conventions.md` "Code structure (ADR-001, ADR-007)" bindings path mention (one-line path fix only).
- Touches: `docs/common-issues.md` path mentions (path fix only), `docs/specs/2026-11-10-structure-refactor.md` status line → implemented, `docs/ROADMAP.md` note → done.
- Proof: vitest totals identical; `just ci` bindings diff passes at the new path.

## Rollback
Each task is one squash commit; revert it alone. R8 and R10 are the only ones with many touched files; both are moves, so a revert restores the old tree exactly.
