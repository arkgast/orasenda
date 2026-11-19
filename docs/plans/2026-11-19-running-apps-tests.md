# Deterministic running_apps tests on macOS — Implementation Plan

- Spec: [docs/specs/2026-11-19-running-apps-tests.md](../specs/2026-11-19-running-apps-tests.md)
- Date: 2026-11-19
- Status: in backlog

## Overview
One task. The whole change is in one file plus one justfile recipe, so splitting it would only add coordination.

## Contract
None. `MacAppControl::running_apps` keeps its signature and output, and `app_ref` stays `pub(crate)`.

## Impact
- Affected call paths:
  - `MacAppControl::running_apps`, used by the Tauri app's Focus app picker through `AppControl`, `apps/orasenda/src-tauri/src/spike/macos.rs:88`;
  - `app_ref`, used by `hide` in `control.rs` and by the rest of the crate.
- Data and migrations: none.
- Tests that must stay green:
  - all `orasenda-platform-macos` tests;
  - `cargo clippy --workspace --all-targets -D warnings`;
  - `./scripts/ci.sh`.
- Rollout and rollback: revert the PR. After the merge, the controller removes the `--skip running_apps_` path from the session pipeline's `land.sh` and the rule from `working-style.md`. Neither is in the repo.

## Dependency graph
```
T1 (independent)
```

## Tasks

### T1: Deterministic running_apps tests: pure filter, invariant tests, ignored live test (#800)
- Priority: 1
- Depends on: none
- Owns: `crates/platform-macos/src/control.rs`, `justfile` (new `live-macos` recipe only)
- Touches: none
- Interfaces:
  - Produces (crate-private):
    - `struct AppSnapshot { pid: i32, name: Option<String>, bundle_id: Option<String>, policy: NSApplicationActivationPolicy }`;
    - `fn snapshot(app: &NSRunningApplication) -> AppSnapshot`;
    - `fn regular_apps(apps: impl IntoIterator<Item = AppSnapshot>) -> Vec<AppRef>`;
    - `fn to_app_ref(app: AppSnapshot) -> AppRef`, the name fallback, which `app_ref` delegates to.
  - Produces (recipe): `just live-macos` runs `cargo test -p orasenda-platform-macos --lib -- --ignored`.
- Acceptance:
  - [ ] `running_apps` is `regular_apps(runningApplications().iter().map(snapshot))`. `app_ref(app)` is `to_app_ref(snapshot(app))`.
  - [ ] No default-run test asserts that the live list is non-empty. `grep -n "is_empty()" control.rs` shows non-empty asserts only inside the `#[ignore]`d live test.
  - [ ] Pure tests pass for: no Regular apps; a mixed list keeping only Regular apps, in order; each step of the name fallback.
  - [ ] `running_apps_holds_only_named_regular_apps` calls the real API on the test thread and on a spawned thread. It asserts that each app is Regular (pids that have quit are skipped), has a non-empty name and is not `com.apple.dock`. It passes with an empty list.
  - [ ] `live_running_apps_lists_regular_apps` is `#[ignore = "needs launchservicesd to report Regular apps; run with just live-macos"]`:
    - It asserts that both threads see at least one Regular app.
    - Its failure message gives the total and the Regular, Accessory and Prohibited counts.
  - [ ] `just live-macos` passes on the developer's Mac while in use, and runs `frontmost_returns_some` as well.
  - [ ] `./scripts/ci.sh` passes.
- Tests first (they fail to compile until the seam exists):
  - `regular_apps_without_regular_entries_is_empty`
  - `regular_apps_keeps_only_regular_in_order`
  - `app_name_prefers_localized_name`
  - `app_name_falls_back_to_bundle_id_when_name_missing_or_empty`
  - `app_name_falls_back_to_pid`
- Notes:
  - The test file must stay under the 500-line ceiling (`control.rs` is 405 lines today). If it would cross 500, move the tests to `control/tests.rs`, following the existing module-file pattern.
  - Follow the `#[ignore = "..."]` precedent at `foreground.rs:113`.
  - Remove `running_apps_contains_regular_apps` and `running_apps_runs_off_main_thread`. Their non-empty checks move to the live test; their per-app checks move to the invariant test.

## Coverage check
| Spec requirement | Task(s) |
|---|---|
| Goal 1: verify independent of launchservicesd state | T1: `running_apps_holds_only_named_regular_apps` |
| Goal 2: pure filter and mapping tests | T1: `regular_apps_*`, `app_name_*` |
| Goal 3: real call on both threads, invariants | T1: `running_apps_holds_only_named_regular_apps` |
| Goal 4: ignored live test with counts | T1: `live_running_apps_lists_regular_apps` |
| Goal 5: `just live-macos` | T1 |
| Goal 6: land.sh and memory cleanup | Controller, after the merge (outside the repo) |
| Failure mode: launchservicesd reports no Regular apps | T1: `regular_apps_without_regular_entries_is_empty` |
| Failure mode: localized name is empty | T1: `app_name_falls_back_to_bundle_id_when_name_missing_or_empty` |
| Failure mode: no name and no bundle id | T1: `app_name_falls_back_to_pid` |
| Failure mode: app quits between listing and checking | T1: `running_apps_holds_only_named_regular_apps` (skips the pid) |
