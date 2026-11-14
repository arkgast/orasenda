# Routines and habits (P4, first part) — Implementation Plan

- Spec: [docs/specs/2026-11-14-routines-and-habits.md](../specs/2026-11-14-routines-and-habits.md)
- Date: 2026-11-14
- Status: in backlog (issue numbers below)

## Overview
Ten tasks, built as components, core and store first, then service, then screens. Each screen task builds behaviour and UI together.

| Task | What | Depends on | Wave |
|---|---|---|---|
| **R0** | Spec, plan, ROADMAP (this PR) and the design canvas | none | 0 |
| **R1** | Core: `LocalDate`, `Weekdays`, tracker, run of days, fresh start, `due_now`, templates | R0 | 1 |
| **R2** | Store: migration 0007 and the four repositories | R0 | 1 |
| **R3** | Components: `RoutineCard` and the `HabitDots` change | R0 (canvas pick) | 1 |
| **R4** | Components: `RoutineStep` and `DayPicker` | R0 (canvas pick) | 1 |
| **R5** | Service and IPC: routines, habits, check-ins, templates, `routines-changed` | R1, R2 | 2 |
| **R6** | Service and IPC: runs; the due nudge and Settings › Notifications row | R5 | 3 |
| **R7** | Routines page: overview, empty state, templates dialog, check-ins, dot grid | R3, R5 | 3 |
| **R8** | Routines page: the run view | R4, R6, R7 | 4 |
| **R9** | Routines page: routine and habit editors, move, remove with Undo | R4, R7 | 4 |
| **R10** | Close-out: CONTEXT terms, spec status, ROADMAP, common issues, follow-ups | all | 5 |

Every task:
- writes its tests first (red), then the code;
- keeps every file at 500 lines or fewer;
- passes `./scripts/ci.sh`;
- gets an opus code review and one fix round.

UI tasks also get the design review against the spec and the canvas pick: layout boxes and gaps, both themes, keyboard and VoiceOver names. There are no screenshots.

Each task that changes IPC regenerates `bindings.ts` with `just bindings` and never hand-merges it. Shared registration files are append-only, and on a conflict we keep both sides:
- `commands/mod.rs`;
- `lib.rs`;
- `build.rs`;
- `capabilities/main.json`;
- `lib_tests.rs`;
- `ipc.rs`;
- `shared/test/fixtures.ts`;
- `dev/layout/scenarios`;
- `designSystem.test.ts`;
- the `Host` trait and its fakes.

## Contract
- **R1 owns** the core API in spec §Interfaces/Core. R5 and R6 consume it.
- **R2 owns** the store repositories and `Entity` variants.
- **R5 owns** the routines IPC contract:
  - the types `RoutinesView`, `RoutineView`, `HabitView`, `HabitDotView`, `RoutineDraft`, `HabitDraft`, `TemplateView`, `TemplateId` and `RoutinesError`;
  - every command except `run_*`;
  - `routines-changed` and `Host::emit_routines_changed`;
  - `RoutinesView.run` as `Option<RunView>`, with `RunView`, `RunStepView` and `StepState` defined here so the view type is stable. It is always `None` until R6.
- **R6 owns:**
  - `run_start`, `run_step` and `run_end`, and `StepOutcome`;
  - the run rules;
  - `Settings.notifyRoutineDue`;
  - the nudge.
- **R3 and R4 own** their components' props as written in spec §Design-system components.
- The screen tasks (R7–R9) consume these contracts and never change them. A needed change goes back to its owner as a ruling on the issue.

## Tasks

### R1 Core: routines domain
- **Owns:** `crates/core/src/routines/` (new: `mod.rs`, `date.rs`, `weekdays.rs`, `tracker.rs`, `due.rs`, `templates.rs`, `tests/`).
- **Touches:** `crates/core/src/lib.rs` (the `pub mod` and re-exports).
- **Acceptance:** spec §Interfaces/Core and §Templates; the core unit tests in §Testing strategy; no clock reads; it builds for the mobile targets (no new dependencies).

### R2 Store: tables and repositories
- **Owns:**
  - `crates/store/migrations/0007_routines.sql`;
  - `crates/store/src/repo/routines/` (`mod.rs`, `routines.rs`, `habits.rs`, `habit_checks.rs`, `routine_runs.rs`, `tests/`).
- **Touches:**
  - `crates/store/src/migrate.rs` and `lib.rs` (`SCHEMA_VERSION`);
  - `txn.rs` (the `Entity` variants);
  - `repo/mod.rs`;
  - `crates/store/src/portability` (the list of syncable tables, merge import);
  - the fresh-schema table-count tests.
- **Acceptance:** spec §Tables and §Data & migrations; the store tests. Repositories take `Txn`, and no `rusqlite` type is public. The `habit_check` merge uses `checked_at`.

### R3 Components: RoutineCard, HabitDots week layout and run line
- **Owns:**
  - `packages/ui/src/components/ui/routine-card.{tsx,md,test.tsx,specimen.tsx}`;
  - `habit-dots.{tsx,md,test.tsx}` and a new `habit-dots.specimen.tsx`.
- **Touches:**
  - `packages/ui/src/index.ts` and the exports;
  - `designSystem.test.ts` counts;
  - `verification/contrast-pairs.json` if a new pair is needed;
  - the specimen and preview lists the design-system build reads.
- **Acceptance:** spec §Design-system components; the canvas pick; both themes; tokens only (the `tailwind-strict` lint).

### R4 Components: RoutineStep and DayPicker
- **Owns:** `packages/ui/src/components/ui/routine-step.*` and `day-picker.*` (tsx, md, test, specimen).
- **Touches:** the same shared lists as R3 (append-only).
- **Acceptance:** spec §Design-system components and the run-view keyboard rules. The `DayPicker` hit targets come from the README.

### R5 Service and IPC: routines, habits, check-ins, templates
- **Owns:**
  - `crates/service/src/routines/` (`mod.rs`, `service.rs`, `view.rs`, `words.rs`, `tests/`);
  - `crates/service/src/api/routines.rs`;
  - `apps/orasenda/src-tauri/src/commands/routines.rs`.
- **Touches:**
  - `crates/service/src/api/mod.rs`, `lib.rs`, and `scheduler/host.rs` (`emit_routines_changed`) with its test fakes;
  - `apps/orasenda/src-tauri/src/commands/mod.rs`, `lib.rs` (command list), `build.rs` (`AppManifest`), `capabilities/main.json`, `lib_tests.rs` (exact lists), `ipc.rs` and `runtime/ticker.rs` (the `AppHost` emit);
  - `bindings.ts` (regenerated);
  - `apps/orasenda/src/shared/test/fixtures.ts` (the routines builders).
- **Acceptance:** spec §Service and IPC, except the `run_*` commands and the nudge. It also emits `routines-changed` at local midnight from the scheduler (`scheduler/tick.rs` in Touches).

### R6 Service and IPC: runs and the due nudge
- **Owns:**
  - `crates/service/src/routines/run.rs` and `nudge.rs` with their tests;
  - the `run_*` commands in `commands/routines.rs`;
  - `apps/orasenda/src/features/settings/panes/Notifications.tsx` (the new row) and its test.
- **Touches:**
  - `crates/service/src/api/settings.rs` and the settings repository keys (`notify.routine_due`);
  - `scheduler/tick.rs` (`nudge_due` once per new local minute);
  - `build.rs`, `capabilities/main.json`, `lib_tests.rs` and `lib.rs`;
  - `bindings.ts`;
  - `settingsQueue.ts`'s key list, `settingsKeys.ts`, the TS `Settings` fixtures and `dev/layout/layoutMain.tsx`.
- **Acceptance:** spec run rules and §Nudge; the service tests for each path; the Settings row behaves like *Tell me when a session ends*.

### R7 Routines page: overview
- **Owns:**
  - `apps/orasenda/src/features/routines/` (`RoutinesPage.tsx`, `useRoutines.ts`, `RoutineList.tsx`, `HabitList.tsx`, `TemplateDialog.tsx`, `routines.css` if needed, and tests split by behaviour);
  - the `routines` case in `apps/orasenda/src/app/App.tsx`.
- **Touches:**
  - `apps/orasenda/src/shared/test/` (builders);
  - `dev/layout/scenarios` (*routines-overview* and *routines-empty*, append-only);
  - `app/Placeholder.test.tsx` if it names Routines.
- **Acceptance:** spec §Routines page (overview, empty state, Add, templates, check-ins, record, failure line). One primary action. Writes are chained.

### R8 Routines page: run view
- **Owns:** `apps/orasenda/src/features/routines/RunView.tsx`, `useRunKeys.ts` and their tests.
- **Touches:**
  - `RoutinesPage.tsx` (showing the run view while `view.run` is set);
  - `dev/layout/scenarios` (*routines-run*).
- **Acceptance:** spec §Run view; the keyboard path Enter, S and Esc, with single keys off; focus and the live region; reduce motion.

### R9 Routines page: editors
- **Owns:** `apps/orasenda/src/features/routines/RoutineEditor.tsx`, `HabitEditor.tsx`, `useUndoRemove.ts` and their tests.
- **Touches:** `RoutineList.tsx` and `HabitList.tsx` (the More menu actions).
- **Acceptance:** spec §Editors; field errors from `RoutinesError`; Move up and Move down; Remove with Undo.

### R10 Close-out
- **Owns:** `CONTEXT.md` (the terms), the spec's Implementation status, `docs/ROADMAP.md` (P4 progress) and `docs/common-issues.md` (lessons).
- **Acceptance:** follow-up issues are filed:
  - the Evening Shutdown flow (SPEC 2.5);
  - weekly review and plan;
  - neutral stats;
  - opening a routine from its notification;
  - linking "set the Frog" to the Board;
  - a template's blocking step after P6.

## Impact
- **Schema:** migration 0007 (renumbered if the Board lands first), four new tables, `SCHEMA_VERSION` +1.
- **Settings:** one new key (R6).
- **Capabilities:** `main` gains 17 commands (R5 14, R6 3).
- **Files near the ceiling:** `commands/mod.rs`, `lib.rs` and `scheduler/tick.rs` are checked before each change. A task that would push one past 500 lines splits it and lists the new sibling in Owns.

## Risks
- **The Board session lands at the same time.** Rebase before landing, renumber the migration if needed, regenerate the bindings, and recount the append-only lists.
- **Linux cloud run.** This P4 run builds on Linux in a cloud container. The macOS-only parts (notifications through `UNUserNotificationCenter`, WebKit specimens, VoiceOver) are covered by fakes and tests here. The owner checks them by hand at the end.
